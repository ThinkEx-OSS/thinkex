-- Reverting the audio recording feature (commit d3343a5d) dropped its Drizzle
-- migration instead of adding a down migration, so the live database still
-- carries state the schema no longer describes: `workspace_items` rows of type
-- 'recording', the `workspace_recordings` table, and the wider
-- `workspace_items_type_check`. A leftover 'recording' row fails the strict
-- type parse on every workspace read and blocks the whole tree. This migration
-- reconciles the database back to the schema.

DELETE FROM "workspace_items" WHERE "type" = 'recording';
--> statement-breakpoint
DROP TABLE IF EXISTS "workspace_recordings";
--> statement-breakpoint
ALTER TABLE "workspace_items" DROP CONSTRAINT IF EXISTS "workspace_items_type_check";
--> statement-breakpoint
ALTER TABLE "workspace_items" ADD CONSTRAINT "workspace_items_type_check" CHECK ("workspace_items"."type" in ('folder', 'document', 'flashcard', 'quiz', 'file'));
