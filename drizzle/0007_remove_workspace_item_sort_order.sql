DROP INDEX IF EXISTS "idx_workspace_items_workspace_order";--> statement-breakpoint
ALTER TABLE "workspace_items" DROP COLUMN IF EXISTS "sort_order";
