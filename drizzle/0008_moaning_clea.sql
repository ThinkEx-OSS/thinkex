CREATE TABLE IF NOT EXISTS "workspace_item_content" (
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

CREATE TABLE IF NOT EXISTS "workspace_item_extracted" (
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

CREATE TABLE IF NOT EXISTS "workspace_item_projection_state" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"last_applied_version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_item_projection_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "workspace_item_user_state" (
	"workspace_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"user_id" text,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_item_user_state_pkey" PRIMARY KEY("workspace_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_item_user_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "workspace_items" ADD COLUMN IF NOT EXISTS "data_schema_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_items" ADD COLUMN IF NOT EXISTS "content_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_items" ADD COLUMN IF NOT EXISTS "source_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_items" ADD COLUMN IF NOT EXISTS "has_ocr" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_items" ADD COLUMN IF NOT EXISTS "ocr_status" text;--> statement-breakpoint
ALTER TABLE "workspace_items" ADD COLUMN IF NOT EXISTS "ocr_page_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_items" ADD COLUMN IF NOT EXISTS "has_transcript" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_items" ADD COLUMN IF NOT EXISTS "processing_status" text;--> statement-breakpoint

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'workspace_item_content_workspace_item_fkey'
	) THEN
		ALTER TABLE "workspace_item_content"
			ADD CONSTRAINT "workspace_item_content_workspace_item_fkey"
			FOREIGN KEY ("workspace_id","item_id")
			REFERENCES "public"."workspace_items"("workspace_id","item_id")
			ON DELETE cascade
			ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'workspace_item_extracted_workspace_item_fkey'
	) THEN
		ALTER TABLE "workspace_item_extracted"
			ADD CONSTRAINT "workspace_item_extracted_workspace_item_fkey"
			FOREIGN KEY ("workspace_id","item_id")
			REFERENCES "public"."workspace_items"("workspace_id","item_id")
			ON DELETE cascade
			ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'workspace_item_projection_state_workspace_id_fkey'
	) THEN
		ALTER TABLE "workspace_item_projection_state"
			ADD CONSTRAINT "workspace_item_projection_state_workspace_id_fkey"
			FOREIGN KEY ("workspace_id")
			REFERENCES "public"."workspaces"("id")
			ON DELETE cascade
			ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'workspace_item_user_state_workspace_item_fkey'
	) THEN
		ALTER TABLE "workspace_item_user_state"
			ADD CONSTRAINT "workspace_item_user_state_workspace_item_fkey"
			FOREIGN KEY ("workspace_id","item_id")
			REFERENCES "public"."workspace_items"("workspace_id","item_id")
			ON DELETE cascade
			ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_workspace_item_content_workspace" ON "workspace_item_content" USING btree ("workspace_id" uuid_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workspace_item_extracted_workspace" ON "workspace_item_extracted" USING btree ("workspace_id" uuid_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workspace_item_projection_state_version" ON "workspace_item_projection_state" USING btree ("last_applied_version" int4_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workspace_item_user_state_workspace_user" ON "workspace_item_user_state" USING btree ("workspace_id" uuid_ops,"user_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workspace_item_user_state_item" ON "workspace_item_user_state" USING btree ("workspace_id" uuid_ops,"item_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workspace_items_workspace_processing" ON "workspace_items" USING btree ("workspace_id" uuid_ops,"processing_status" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workspace_items_workspace_ocr" ON "workspace_items" USING btree ("workspace_id" uuid_ops,"has_ocr" bool_ops,"ocr_status" text_ops);--> statement-breakpoint

DROP POLICY IF EXISTS "Users can read projected workspace items they have access to" ON "workspace_items";--> statement-breakpoint
DROP POLICY IF EXISTS "Users can write projected workspace items they have write acces" ON "workspace_items";--> statement-breakpoint
DROP POLICY IF EXISTS "Users can write projected workspace items they have write access to" ON "workspace_items";--> statement-breakpoint
DROP POLICY IF EXISTS "Users can read projected workspace item content they have access to" ON "workspace_item_content";--> statement-breakpoint
DROP POLICY IF EXISTS "Users can write projected workspace item content they have write access to" ON "workspace_item_content";--> statement-breakpoint
DROP POLICY IF EXISTS "Users can read projected workspace item extracted data they have access to" ON "workspace_item_extracted";--> statement-breakpoint
DROP POLICY IF EXISTS "Users can write projected workspace item extracted data they have write access to" ON "workspace_item_extracted";--> statement-breakpoint
DROP POLICY IF EXISTS "Users can read projection state they have access to" ON "workspace_item_projection_state";--> statement-breakpoint
DROP POLICY IF EXISTS "Users can write projection state they have write access to" ON "workspace_item_projection_state";--> statement-breakpoint
DROP POLICY IF EXISTS "Users can read their projected workspace item state" ON "workspace_item_user_state";--> statement-breakpoint
DROP POLICY IF EXISTS "Users can write their projected workspace item state" ON "workspace_item_user_state";--> statement-breakpoint

CREATE POLICY "Users can read projected workspace item content they have access to" ON "workspace_item_content" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_content.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_content.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text))))));--> statement-breakpoint

CREATE POLICY "Users can write projected workspace item content they have write access to" ON "workspace_item_content" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_content.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_content.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_content.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_content.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text)))));--> statement-breakpoint

CREATE POLICY "Users can read projected workspace item extracted data they have access to" ON "workspace_item_extracted" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_extracted.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_extracted.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text))))));--> statement-breakpoint

CREATE POLICY "Users can write projected workspace item extracted data they have write access to" ON "workspace_item_extracted" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_extracted.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_extracted.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_extracted.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_extracted.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text)))));--> statement-breakpoint

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

CREATE POLICY "Users can read their projected workspace item state" ON "workspace_item_user_state" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_user_state.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_user_state.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text))))));--> statement-breakpoint

CREATE POLICY "Users can write their projected workspace item state" ON "workspace_item_user_state" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_user_state.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_user_state.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_user_state.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_user_state.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text)))));--> statement-breakpoint

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
  WHERE ((c.workspace_id = workspace_items.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text))))); 