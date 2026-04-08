CREATE TABLE "workspace_items" (
	"workspace_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"sort_order" integer NOT NULL,
	"data" jsonb NOT NULL,
	"color" text,
	"folder_id" text,
	"layout" jsonb,
	"last_modified" bigint,
	"source_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_items_pkey" PRIMARY KEY("workspace_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace_item_projection_state" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"last_applied_version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_item_projection_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_items" ADD CONSTRAINT "workspace_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_item_projection_state" ADD CONSTRAINT "workspace_item_projection_state_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_workspace_items_workspace" ON "workspace_items" USING btree ("workspace_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_items_workspace_folder" ON "workspace_items" USING btree ("workspace_id" uuid_ops,"folder_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_items_workspace_type" ON "workspace_items" USING btree ("workspace_id" uuid_ops,"type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_items_workspace_updated" ON "workspace_items" USING btree ("workspace_id" uuid_ops,"updated_at" timestamptz_ops DESC);--> statement-breakpoint
CREATE INDEX "idx_workspace_items_workspace_version" ON "workspace_items" USING btree ("workspace_id" uuid_ops,"source_version" int4_ops DESC);--> statement-breakpoint
CREATE INDEX "idx_workspace_items_workspace_order" ON "workspace_items" USING btree ("workspace_id" uuid_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_item_projection_state_version" ON "workspace_item_projection_state" USING btree ("last_applied_version" int4_ops DESC);--> statement-breakpoint
CREATE POLICY "Users can read projected workspace items they have access to" ON "workspace_items" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_items.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_items.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text))))));--> statement-breakpoint
CREATE POLICY "Users can write projected workspace items they have write access to" ON "workspace_items" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_items.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_items.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_items.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_items.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text)))));--> statement-breakpoint
CREATE POLICY "Users can read projection state they have access to" ON "workspace_item_projection_state" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_projection_state.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_projection_state.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text))))));--> statement-breakpoint
CREATE POLICY "Users can write projection state they have write access to" ON "workspace_item_projection_state" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_projection_state.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_projection_state.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_projection_state.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_projection_state.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text)))));--> statement-breakpoint
