-- Multi-use share links: anyone with the link can join workspace (no email restriction)
CREATE TABLE "workspace_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"token" text NOT NULL,
	"permission_level" text DEFAULT 'editor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "workspace_share_links_token_key" UNIQUE("token"),
	CONSTRAINT "workspace_share_links_workspace_key" UNIQUE("workspace_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_share_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workspace_share_links" ADD CONSTRAINT "workspace_share_links_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_workspace_share_links_token" ON "workspace_share_links" USING btree ("token" text_ops);
--> statement-breakpoint
CREATE INDEX "idx_workspace_share_links_workspace" ON "workspace_share_links" USING btree ("workspace_id" uuid_ops);
--> statement-breakpoint
CREATE POLICY "Public can view share link by token" ON "workspace_share_links" AS PERMISSIVE FOR SELECT TO public USING (true);
--> statement-breakpoint
CREATE POLICY "Owners and editors can manage share links" ON "workspace_share_links" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_share_links.workspace_id) AND (w.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_share_links.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text)))));
