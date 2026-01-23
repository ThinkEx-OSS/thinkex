CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"is_anonymous" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"onboarding_completed" boolean DEFAULT false,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "user_profiles_user_id_key" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"timestamp" bigint NOT NULL,
	"user_id" text NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"user_name" text,
	CONSTRAINT "workspace_events_event_id_key" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"snapshot_version" integer NOT NULL,
	"state" jsonb NOT NULL,
	"event_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "workspace_snapshots_workspace_id_snapshot_version_key" UNIQUE("workspace_id","snapshot_version")
);
--> statement-breakpoint
ALTER TABLE "workspace_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '',
	"template" text DEFAULT 'blank',
	"is_public" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"slug" text,
	"icon" text,
	"sort_order" integer,
	"color" text,
	"last_opened_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_events" ADD CONSTRAINT "workspace_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_snapshots" ADD CONSTRAINT "workspace_snapshots_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_account_user_id" ON "account" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_session_user_id" ON "session" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_session_token" ON "session" USING btree ("token" text_ops);--> statement-breakpoint
CREATE INDEX "idx_user_email" ON "user" USING btree ("email" text_ops);--> statement-breakpoint
CREATE INDEX "idx_user_profiles_user_id" ON "user_profiles" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_verification_identifier" ON "verification" USING btree ("identifier" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_events_event_id" ON "workspace_events" USING btree ("event_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_events_timestamp" ON "workspace_events" USING btree ("workspace_id" uuid_ops,"timestamp" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_events_user_name" ON "workspace_events" USING btree ("user_name" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_events_workspace" ON "workspace_events" USING btree ("workspace_id" uuid_ops,"version" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_snapshots_version" ON "workspace_snapshots" USING btree ("workspace_id" uuid_ops,"snapshot_version" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_workspace_snapshots_workspace" ON "workspace_snapshots" USING btree ("workspace_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_workspaces_created_at" ON "workspaces" USING btree ("created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_workspaces_slug" ON "workspaces" USING btree ("slug" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workspaces_user_id" ON "workspaces" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_workspaces_user_slug" ON "workspaces" USING btree ("user_id" text_ops,"slug" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workspaces_user_sort_order" ON "workspaces" USING btree ("user_id" text_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_workspaces_last_opened_at" ON "workspaces" USING btree ("last_opened_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE POLICY "Users can insert their own profile" ON "user_profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT (auth.jwt() ->> 'sub'::text)) = user_id));--> statement-breakpoint
CREATE POLICY "Users can update their own profile" ON "user_profiles" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can view their own profile" ON "user_profiles" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can insert workspace events they have write access to" ON "workspace_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_events.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))));--> statement-breakpoint
CREATE POLICY "Users can read workspace events they have access to" ON "workspace_events" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Service role can insert workspace snapshots" ON "workspace_snapshots" AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Users can read workspace snapshots they have access to" ON "workspace_snapshots" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Users can delete their own workspaces" ON "workspaces" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT (auth.jwt() ->> 'sub'::text)) = user_id));--> statement-breakpoint
CREATE POLICY "Users can insert their own workspaces" ON "workspaces" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can update their own workspaces" ON "workspaces" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can view their own workspaces" ON "workspaces" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint

-- =============================================================================
-- Database Functions
-- =============================================================================

CREATE OR REPLACE FUNCTION get_workspace_version(p_workspace_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT COALESCE(MAX(version), 0)
  FROM workspace_events
  WHERE workspace_id = p_workspace_id;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION append_workspace_event(
  p_workspace_id uuid,
  p_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_timestamp bigint,
  p_user_id text,
  p_expected_version integer,
  p_user_name text DEFAULT NULL
)
RETURNS TABLE(version integer, conflict boolean)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_current_version INTEGER;
  v_new_version INTEGER;
BEGIN
  PERFORM 1 FROM workspaces WHERE id = p_workspace_id FOR UPDATE;
  SELECT get_workspace_version(p_workspace_id) INTO v_current_version;
  IF v_current_version != p_expected_version THEN
    RETURN QUERY SELECT v_current_version, TRUE;
    RETURN;
  END IF;
  v_new_version := v_current_version + 1;
  INSERT INTO workspace_events (
    workspace_id, event_id, event_type, payload, timestamp, user_id, user_name, version
  ) VALUES (
    p_workspace_id, p_event_id, p_event_type, p_payload, p_timestamp, p_user_id, p_user_name, v_new_version
  );
  RETURN QUERY SELECT v_new_version, FALSE;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION create_workspace_snapshot(
  p_workspace_id uuid,
  p_state jsonb,
  p_snapshot_version integer,
  p_event_count integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_snapshot_id UUID;
BEGIN
  INSERT INTO workspace_snapshots (workspace_id, snapshot_version, state, event_count)
  VALUES (p_workspace_id, p_snapshot_version, p_state, p_event_count)
  ON CONFLICT (workspace_id, snapshot_version) 
  DO UPDATE SET state = EXCLUDED.state, event_count = EXCLUDED.event_count, created_at = NOW()
  RETURNING id INTO v_snapshot_id;
  
  DELETE FROM workspace_snapshots
  WHERE workspace_id = p_workspace_id
  AND snapshot_version < (
    SELECT snapshot_version FROM workspace_snapshots
    WHERE workspace_id = p_workspace_id
    ORDER BY snapshot_version DESC OFFSET 3 LIMIT 1
  );
  RETURN v_snapshot_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_latest_snapshot(p_workspace_id uuid)
RETURNS TABLE(snapshot_version integer, state jsonb, event_count integer)
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT snapshot_version, state, event_count
  FROM workspace_snapshots
  WHERE workspace_id = p_workspace_id
  ORDER BY snapshot_version DESC
  LIMIT 1;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_latest_snapshot_fast(p_workspace_id uuid)
RETURNS TABLE(id uuid, snapshot_version integer, state jsonb, event_count integer, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT ws.id, ws.snapshot_version, ws.state, ws.event_count, ws.created_at
  FROM workspace_snapshots ws
  WHERE ws.workspace_id = p_workspace_id
  ORDER BY ws.snapshot_version DESC
  LIMIT 1;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION get_workspace_events_fast(
  p_workspace_id uuid,
  p_from_version integer DEFAULT 0,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE(event_id text, event_type text, payload jsonb, "timestamp" bigint, user_id text, user_name text, version integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT we.event_id, we.event_type, we.payload, we.timestamp, we.user_id, we.user_name, we.version
  FROM workspace_events we
  WHERE we.workspace_id = p_workspace_id AND we.version > p_from_version
  ORDER BY we.version ASC
  LIMIT p_limit;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION needs_snapshot(
  p_workspace_id uuid,
  p_snapshot_threshold integer DEFAULT 100
)
RETURNS TABLE(needs_snapshot boolean, current_version integer, last_snapshot_version integer, events_since_snapshot integer)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_current_version INTEGER;
  v_last_snapshot_version INTEGER;
  v_events_since INTEGER;
BEGIN
  SELECT COALESCE(MAX(version), 0) INTO v_current_version
  FROM workspace_events WHERE workspace_id = p_workspace_id;
  
  SELECT COALESCE(MAX(snapshot_version), 0) INTO v_last_snapshot_version
  FROM workspace_snapshots WHERE workspace_id = p_workspace_id;
  
  v_events_since := v_current_version - v_last_snapshot_version;
  
  RETURN QUERY SELECT
    v_events_since >= p_snapshot_threshold,
    v_current_version,
    v_last_snapshot_version,
    v_events_since;
END;
$$;