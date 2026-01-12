ALTER TABLE "workspace_shares" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY "Users can create shares for their workspaces" ON "workspace_shares" CASCADE;--> statement-breakpoint
DROP POLICY "Users can delete shares for their workspaces" ON "workspace_shares" CASCADE;--> statement-breakpoint
DROP POLICY "Users can update shares for their workspaces" ON "workspace_shares" CASCADE;--> statement-breakpoint
DROP POLICY "Users can view shares for their workspaces" ON "workspace_shares" CASCADE;--> statement-breakpoint
DROP TABLE "workspace_shares" CASCADE;--> statement-breakpoint
ALTER POLICY "Users can insert workspace events they have write access to" ON "workspace_events" TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_events.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))));