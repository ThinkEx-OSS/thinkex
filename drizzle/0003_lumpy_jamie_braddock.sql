ALTER TABLE "workspace_items" ADD COLUMN "sort_order" integer;--> statement-breakpoint
WITH "ranked_workspace_items" AS (
	SELECT
		"workspace_id",
		"item_id",
		ROW_NUMBER() OVER (
			PARTITION BY "workspace_id", "folder_id", ("type" = 'folder')
			ORDER BY "created_at" ASC, "item_id" ASC
		) - 1 AS "sort_order"
	FROM "workspace_items"
)
UPDATE "workspace_items" AS "workspace_items"
SET "sort_order" = "ranked_workspace_items"."sort_order"
FROM "ranked_workspace_items"
WHERE "workspace_items"."workspace_id" = "ranked_workspace_items"."workspace_id"
	AND "workspace_items"."item_id" = "ranked_workspace_items"."item_id";--> statement-breakpoint
CREATE INDEX "idx_workspace_items_workspace_folder_type_sort_order" ON "workspace_items" USING btree ("workspace_id" uuid_ops,"folder_id" text_ops,"type" text_ops,"sort_order" int4_ops);
