-- =============================================================================
-- Workspace Collaborators Table for Real-Time Collaboration
-- =============================================================================

CREATE TABLE "workspace_collaborators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"permission_level" text DEFAULT 'editor' NOT NULL,
	"invite_token" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "workspace_collaborators_invite_token_unique" UNIQUE("invite_token"),
	CONSTRAINT "workspace_collaborators_workspace_user_unique" UNIQUE("workspace_id", "user_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_collaborators" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_collaborators" ADD CONSTRAINT "workspace_collaborators_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_workspace_collaborators_lookup" ON "workspace_collaborators" USING btree ("user_id" text_ops, "workspace_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_collaborators_workspace" ON "workspace_collaborators" USING btree ("workspace_id" uuid_ops);--> statement-breakpoint

-- RLS Policies for workspace_collaborators
CREATE POLICY "Owners can manage collaborators" ON "workspace_collaborators" AS PERMISSIVE FOR ALL TO "authenticated" 
USING (EXISTS (
  SELECT 1 FROM workspaces w 
  WHERE w.id = workspace_collaborators.workspace_id 
  AND w.user_id = (auth.jwt() ->> 'sub'::text)
));--> statement-breakpoint

CREATE POLICY "Collaborators can view their access" ON "workspace_collaborators" AS PERMISSIVE FOR SELECT TO "authenticated"
USING (user_id = (auth.jwt() ->> 'sub'::text));--> statement-breakpoint

-- =============================================================================
-- Broadcast Trigger for workspace_events
-- Automatically broadcasts when an event is inserted
-- =============================================================================

CREATE OR REPLACE FUNCTION workspace_events_broadcast_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Broadcast the event to the workspace channel
  -- All clients subscribed to workspace:<id>:events will receive this
  PERFORM realtime.broadcast_changes(
    'workspace:' || NEW.workspace_id::text || ':events',
    TG_OP,          -- operation type: INSERT
    TG_OP,          -- event name: INSERT
    TG_TABLE_NAME,  -- table name
    TG_TABLE_SCHEMA, -- schema
    NEW,            -- new row data
    OLD             -- old row data (null for INSERT)
  );
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER workspace_events_realtime_broadcast
  AFTER INSERT ON workspace_events
  FOR EACH ROW EXECUTE FUNCTION workspace_events_broadcast_trigger();--> statement-breakpoint

-- =============================================================================
-- RLS Policies for realtime.messages
-- Authorizes who can subscribe/publish to workspace channels
-- =============================================================================

-- Allow workspace owner OR collaborators to receive events
CREATE POLICY "workspace_access_can_read" ON realtime.messages
FOR SELECT TO authenticated
USING (
  topic LIKE 'workspace:%:events'
  AND (
    -- Owner access
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = (SPLIT_PART(topic, ':', 2))::uuid
        AND w.user_id = (auth.jwt() ->> 'sub'::text)
    )
    OR
    -- Collaborator access  
    EXISTS (
      SELECT 1 FROM public.workspace_collaborators c
      WHERE c.workspace_id = (SPLIT_PART(topic, ':', 2))::uuid
        AND c.user_id = (auth.jwt() ->> 'sub'::text)
    )
  )
);--> statement-breakpoint

-- Allow workspace owner OR editor collaborators to send events (presence)
CREATE POLICY "workspace_access_can_write" ON realtime.messages
FOR INSERT TO authenticated
WITH CHECK (
  topic LIKE 'workspace:%:events'
  AND (
    -- Owner access
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = (SPLIT_PART(topic, ':', 2))::uuid
        AND w.user_id = (auth.jwt() ->> 'sub'::text)
    )
    OR
    -- Editor collaborator access
    EXISTS (
      SELECT 1 FROM public.workspace_collaborators c
      WHERE c.workspace_id = (SPLIT_PART(topic, ':', 2))::uuid
        AND c.user_id = (auth.jwt() ->> 'sub'::text)
        AND c.permission_level = 'editor'
    )
  )
);--> statement-breakpoint

-- =============================================================================
-- Update existing RLS policies on workspace_events to include collaborators
-- =============================================================================

-- Drop old policy that only allows owner
DROP POLICY IF EXISTS "Users can insert workspace events they have write access to" ON "workspace_events";--> statement-breakpoint

-- New policy: owners AND editor collaborators can insert events
CREATE POLICY "Users can insert workspace events they have write access to" ON "workspace_events" AS PERMISSIVE FOR INSERT TO public 
WITH CHECK (
  -- Owner access
  EXISTS (
    SELECT 1 FROM workspaces
    WHERE workspaces.id = workspace_events.workspace_id 
    AND workspaces.user_id = (auth.jwt() ->> 'sub'::text)
  )
  OR
  -- Editor collaborator access
  EXISTS (
    SELECT 1 FROM workspace_collaborators c
    WHERE c.workspace_id = workspace_events.workspace_id
    AND c.user_id = (auth.jwt() ->> 'sub'::text)
    AND c.permission_level = 'editor'
  )
);--> statement-breakpoint

-- Update select policy to include collaborators
DROP POLICY IF EXISTS "Users can read workspace events they have access to" ON "workspace_events";--> statement-breakpoint

CREATE POLICY "Users can read workspace events they have access to" ON "workspace_events" AS PERMISSIVE FOR SELECT TO public
USING (
  -- Owner access
  EXISTS (
    SELECT 1 FROM workspaces
    WHERE workspaces.id = workspace_events.workspace_id 
    AND workspaces.user_id = (auth.jwt() ->> 'sub'::text)
  )
  OR
  -- Collaborator access (viewer or editor)
  EXISTS (
    SELECT 1 FROM workspace_collaborators c
    WHERE c.workspace_id = workspace_events.workspace_id
    AND c.user_id = (auth.jwt() ->> 'sub'::text)
  )
);
