ALTER TABLE "workspace_document_checkpoints" RENAME TO "workspace_item_contents";--> statement-breakpoint
ALTER TABLE "workspace_item_contents" DROP CONSTRAINT "workspace_document_checkpoints_item_id_workspace_items_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_item_contents" ADD CONSTRAINT "workspace_item_contents_item_id_workspace_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."workspace_items"("id") ON DELETE cascade ON UPDATE no action;