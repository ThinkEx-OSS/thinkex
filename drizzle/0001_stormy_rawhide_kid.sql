CREATE TABLE "workspace_item_content" (
	"workspace_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"data_schema_version" integer DEFAULT 1 NOT NULL,
	"content_hash" text DEFAULT '' NOT NULL,
	"text_content" text,
	"structured_data" jsonb,
	"asset_data" jsonb,
	"embed_data" jsonb,
	"source_data" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_item_content_pkey" PRIMARY KEY("workspace_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_item_content" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace_item_extracted" (
	"workspace_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"content_preview" text,
	"ocr_text" text,
	"transcript_text" text,
	"ocr_pages" jsonb,
	"transcript_segments" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_item_extracted_pkey" PRIMARY KEY("workspace_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_item_extracted" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace_item_projection_state" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"last_applied_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_item_projection_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace_item_user_state" (
	"workspace_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"user_id" text NOT NULL,
	"state_key" text DEFAULT 'item' NOT NULL,
	"state_type" text NOT NULL,
	"state_schema_version" integer DEFAULT 1 NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_item_user_state_pkey" PRIMARY KEY("workspace_id","item_id","user_id","state_key")
);
--> statement-breakpoint
ALTER TABLE "workspace_item_user_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace_items" (
	"workspace_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"color" text,
	"folder_id" text,
	"layout" jsonb,
	"last_modified" bigint,
	"source_version" integer NOT NULL,
	"data_schema_version" integer DEFAULT 1 NOT NULL,
	"content_hash" text DEFAULT '' NOT NULL,
	"processing_status" text,
	"has_ocr" boolean DEFAULT false NOT NULL,
	"ocr_status" text,
	"ocr_page_count" integer DEFAULT 0 NOT NULL,
	"has_transcript" boolean DEFAULT false NOT NULL,
	"source_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_items_pkey" PRIMARY KEY("workspace_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_item_content" ADD CONSTRAINT "workspace_item_content_workspace_item_fkey" FOREIGN KEY ("workspace_id","item_id") REFERENCES "public"."workspace_items"("workspace_id","item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_item_extracted" ADD CONSTRAINT "workspace_item_extracted_workspace_item_fkey" FOREIGN KEY ("workspace_id","item_id") REFERENCES "public"."workspace_items"("workspace_id","item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_item_projection_state" ADD CONSTRAINT "workspace_item_projection_state_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_item_user_state" ADD CONSTRAINT "workspace_item_user_state_workspace_item_fkey" FOREIGN KEY ("workspace_id","item_id") REFERENCES "public"."workspace_items"("workspace_id","item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_items" ADD CONSTRAINT "workspace_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_workspace_item_content_workspace" ON "workspace_item_content" USING btree ("workspace_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_item_extracted_workspace" ON "workspace_item_extracted" USING btree ("workspace_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_item_projection_state_version" ON "workspace_item_projection_state" USING btree ("last_applied_version" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_item_user_state_workspace_user" ON "workspace_item_user_state" USING btree ("workspace_id" uuid_ops,"user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_item_user_state_item" ON "workspace_item_user_state" USING btree ("workspace_id" uuid_ops,"item_id" text_ops,"user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_items_workspace" ON "workspace_items" USING btree ("workspace_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_items_workspace_folder" ON "workspace_items" USING btree ("workspace_id" uuid_ops,"folder_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_items_workspace_type" ON "workspace_items" USING btree ("workspace_id" uuid_ops,"type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_items_workspace_updated" ON "workspace_items" USING btree ("workspace_id" uuid_ops,"updated_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_items_workspace_version" ON "workspace_items" USING btree ("workspace_id" uuid_ops,"source_version" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_items_workspace_processing" ON "workspace_items" USING btree ("workspace_id" uuid_ops,"processing_status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_items_workspace_ocr" ON "workspace_items" USING btree ("workspace_id" uuid_ops,"has_ocr" bool_ops,"ocr_status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_items_workspace_ocr_page_count" ON "workspace_items" USING btree ("workspace_id" uuid_ops,"ocr_page_count" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_items_workspace_has_transcript" ON "workspace_items" USING btree ("workspace_id" uuid_ops,"has_transcript" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_items_workspace_source_count" ON "workspace_items" USING btree ("workspace_id" uuid_ops,"source_count" int4_ops);--> statement-breakpoint
CREATE POLICY "Users can read workspace item content they have access to" ON "workspace_item_content" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_content.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_content.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text))))));--> statement-breakpoint
CREATE POLICY "Users can write workspace item content they have write access to" ON "workspace_item_content" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_content.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_content.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_content.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_content.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text)))));--> statement-breakpoint
CREATE POLICY "Users can read workspace item extracted data they have access to" ON "workspace_item_extracted" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_extracted.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_extracted.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text))))));--> statement-breakpoint
CREATE POLICY "Users can write workspace item extracted data they have write access to" ON "workspace_item_extracted" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_extracted.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_extracted.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_extracted.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_extracted.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text)))));--> statement-breakpoint
CREATE POLICY "Users can read workspace item projection state they have access to" ON "workspace_item_projection_state" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_projection_state.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_projection_state.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text))))));--> statement-breakpoint
CREATE POLICY "Users can read their workspace item user state" ON "workspace_item_user_state" AS PERMISSIVE FOR SELECT TO public USING (((workspace_item_user_state.user_id = (auth.jwt() ->> 'sub'::text)) AND ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_user_state.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_user_state.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text))))))));--> statement-breakpoint
CREATE POLICY "Users can write their workspace item user state" ON "workspace_item_user_state" AS PERMISSIVE FOR ALL TO public USING (((workspace_item_user_state.user_id = (auth.jwt() ->> 'sub'::text)) AND ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_user_state.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_user_state.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)))))))) WITH CHECK (((workspace_item_user_state.user_id = (auth.jwt() ->> 'sub'::text)) AND ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_user_state.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_user_state.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text))))))));--> statement-breakpoint
CREATE POLICY "Users can read workspace items they have access to" ON "workspace_items" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_items.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_items.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text))))));--> statement-breakpoint
CREATE POLICY "Users can write workspace items they have write access to" ON "workspace_items" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_items.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_items.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_items.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_items.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text)))));