import {
  boolean,
  createBuilder,
  createSchema,
  json,
  relationships,
  Row,
  string,
  number,
  table,
} from "@rocicorp/zero";
import type { ZeroContext } from "./client";

const workspaceItems = table("workspace_items")
  .from("workspace_items")
  .columns({
    workspaceId: string().from("workspace_id"),
    itemId: string().from("item_id"),
    type: string(),
    name: string(),
    subtitle: string(),
    color: string().optional(),
    folderId: string().from("folder_id").optional(),
    layout: json().optional(),
    lastModified: number().from("last_modified").optional(),
    sourceVersion: number().from("source_version"),
    dataSchemaVersion: number().from("data_schema_version"),
    contentHash: string().from("content_hash"),
    processingStatus: string().from("processing_status").optional(),
    hasOcr: boolean().from("has_ocr"),
    ocrStatus: string().from("ocr_status").optional(),
    ocrPageCount: number().from("ocr_page_count"),
    hasTranscript: boolean().from("has_transcript"),
    sourceCount: number().from("source_count"),
    createdAt: number().from("created_at").optional(),
  })
  .primaryKey("workspaceId", "itemId");

const workspaceItemContent = table("workspace_item_content")
  .from("workspace_item_content")
  .columns({
    workspaceId: string().from("workspace_id"),
    itemId: string().from("item_id"),
    textContent: string().from("text_content").optional(),
    structuredData: json().from("structured_data").optional(),
    assetData: json().from("asset_data").optional(),
    embedData: json().from("embed_data").optional(),
    sourceData: json().from("source_data").optional(),
    dataSchemaVersion: number().from("data_schema_version"),
    contentHash: string().from("content_hash"),
  })
  .primaryKey("workspaceId", "itemId");

const workspaceItemsRelationships = relationships(
  workspaceItems,
  ({ one }) => ({
    workspaceItemContent: one({
      sourceField: ["workspaceId", "itemId"],
      destField: ["workspaceId", "itemId"],
      destSchema: workspaceItemContent,
    }),
  }),
);

const workspaceItemContentRelationships = relationships(
  workspaceItemContent,
  ({ one }) => ({
    workspaceItem: one({
      sourceField: ["workspaceId", "itemId"],
      destField: ["workspaceId", "itemId"],
      destSchema: workspaceItems,
    }),
  }),
);

export const schema = createSchema({
  tables: [workspaceItems, workspaceItemContent],
  relationships: [workspaceItemsRelationships, workspaceItemContentRelationships],
});

export type ZeroSchema = typeof schema;

export type WorkspaceItemsRow = Row<(typeof schema)["tables"]["workspace_items"]>;
export type WorkspaceItemContentRow =
  Row<(typeof schema)["tables"]["workspace_item_content"]>;

export const zql = createBuilder(schema);
export const builder = zql;

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    schema: ZeroSchema;
    context: ZeroContext;
  }
}
