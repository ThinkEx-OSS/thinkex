DELETE FROM "workspace_item_user_state";--> statement-breakpoint

DO $$ BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'workspace_item_user_state'
			AND column_name = 'user_id'
			AND is_nullable = 'YES'
	) THEN
		ALTER TABLE "workspace_item_user_state"
			ALTER COLUMN "user_id" SET NOT NULL;
	END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "workspace_item_user_state"
	DROP CONSTRAINT IF EXISTS "workspace_item_user_state_pkey";--> statement-breakpoint

ALTER TABLE "workspace_item_user_state"
	ADD CONSTRAINT "workspace_item_user_state_pkey"
	PRIMARY KEY ("workspace_id","item_id","user_id");--> statement-breakpoint

DROP INDEX IF EXISTS "idx_workspace_item_user_state_item";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workspace_item_user_state_item" ON "workspace_item_user_state" USING btree ("workspace_id" uuid_ops,"item_id" text_ops,"user_id" text_ops);--> statement-breakpoint

DROP POLICY IF EXISTS "Users can read their projected workspace item state" ON "workspace_item_user_state";--> statement-breakpoint
DROP POLICY IF EXISTS "Users can write their projected workspace item state" ON "workspace_item_user_state";--> statement-breakpoint

CREATE POLICY "Users can read their projected workspace item state" ON "workspace_item_user_state" AS PERMISSIVE FOR SELECT TO public USING ((((workspace_item_user_state.user_id = (auth.jwt() ->> 'sub'::text)) AND (EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_user_state.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text)))))) OR ((workspace_item_user_state.user_id = (auth.jwt() ->> 'sub'::text)) AND (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_user_state.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text))))))));--> statement-breakpoint

CREATE POLICY "Users can write their projected workspace item state" ON "workspace_item_user_state" AS PERMISSIVE FOR ALL TO public USING ((((workspace_item_user_state.user_id = (auth.jwt() ->> 'sub'::text)) AND (EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_user_state.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text)))))) OR ((workspace_item_user_state.user_id = (auth.jwt() ->> 'sub'::text)) AND (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_user_state.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)))))))) WITH CHECK ((((workspace_item_user_state.user_id = (auth.jwt() ->> 'sub'::text)) AND (EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_user_state.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text)))))) OR ((workspace_item_user_state.user_id = (auth.jwt() ->> 'sub'::text)) AND (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_user_state.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text))))))));--> statement-breakpoint
