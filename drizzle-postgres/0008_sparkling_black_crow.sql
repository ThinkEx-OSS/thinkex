-- Accent-folding text search. `unaccent` on its own is only STABLE and cannot
-- appear in a generated column, but a text search configuration that uses it as
-- a dictionary can: to_tsvector(regconfig, text) is IMMUTABLE.
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'english_unaccent') THEN
		CREATE TEXT SEARCH CONFIGURATION english_unaccent (COPY = english);
		ALTER TEXT SEARCH CONFIGURATION english_unaccent
			ALTER MAPPING FOR hword, hword_part, word WITH unaccent, english_stem;
	END IF;
END
$$;--> statement-breakpoint
-- Dropping a generated column drops its index too, so both are recreated.
ALTER TABLE "workspace_item_contents" drop column "search_vector";--> statement-breakpoint
ALTER TABLE "workspace_item_contents" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('english_unaccent', "workspace_item_contents"."search_text")) STORED;--> statement-breakpoint
CREATE INDEX "workspace_item_contents_search_idx" ON "workspace_item_contents" USING gin ("search_vector");--> statement-breakpoint
ALTER TABLE "workspace_item_pages" drop column "search_vector";--> statement-breakpoint
ALTER TABLE "workspace_item_pages" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('english_unaccent', "workspace_item_pages"."markdown")) STORED;--> statement-breakpoint
CREATE INDEX "workspace_item_pages_search_idx" ON "workspace_item_pages" USING gin ("search_vector");
