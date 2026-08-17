ALTER TABLE "workspace_item_contents" ADD COLUMN "search_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_item_contents" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "workspace_item_contents"."search_text")) STORED;--> statement-breakpoint
ALTER TABLE "workspace_item_pages" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "workspace_item_pages"."markdown")) STORED;--> statement-breakpoint
CREATE INDEX "workspace_item_contents_search_idx" ON "workspace_item_contents" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "workspace_item_pages_search_idx" ON "workspace_item_pages" USING gin ("search_vector");