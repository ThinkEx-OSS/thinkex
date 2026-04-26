CREATE TABLE "workspace_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"actor_name" text,
	"actor_image" text,
	"item_id" text,
	"item_type" text,
	"item_name" text,
	"action" text NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"edit_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_events" ADD CONSTRAINT "workspace_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_workspace_events_workspace_time" ON "workspace_events" USING btree ("workspace_id" uuid_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_events_coalesce" ON "workspace_events" USING btree ("workspace_id" uuid_ops,"user_id" text_ops,"item_id" text_ops,"action" text_ops,"updated_at" timestamptz_ops);--> statement-breakpoint
CREATE POLICY "Users can read workspace events they have access to" ON "workspace_events" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_events.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_events.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text))))));
-- Add to Zero replication publication
ALTER PUBLICATION zero_pub ADD TABLE workspace_events;
