import { describe, expect, it } from "vitest";
import type { Item } from "@/lib/workspace-state/types";
import { eventReducer } from "@/lib/workspace/event-reducer";
import type { WorkspaceEvent } from "@/lib/workspace/events";
import { deriveWorkspaceProjectionChangeSet } from "@/lib/workspace/workspace-items-projector";
import { buildWorkspaceItemTableRows } from "@/lib/workspace/workspace-item-model";

function applyEvents(events: WorkspaceEvent[], baseState: Item[] = []) {
  let state = baseState;

  for (const event of events) {
    state = deriveWorkspaceProjectionChangeSet(state, event).nextItems;
  }

  return state;
}

describe("workspace-items-projector", () => {
  it("matches replay semantics across create, patch, move, bulk, and delete flows", () => {
    const doc: Item = {
      id: "doc-1",
      type: "document",
      name: "Doc",
      subtitle: "",
      data: {
        markdown: "hello",
        sources: [{ title: "A", url: "https://a.test" }],
      },
      layout: { lg: { x: 0, y: 0, w: 4, h: 3 } },
    };
    const note: Item = {
      id: "doc-2",
      type: "document",
      name: "Note",
      subtitle: "",
      data: { markdown: "note" },
    };
    const folder: Item = {
      id: "folder-1",
      type: "folder",
      name: "Folder",
      subtitle: "",
      data: {},
    };

    const events: WorkspaceEvent[] = [
      {
        id: "evt-1",
        type: "ITEM_CREATED",
        payload: { id: doc.id, item: doc },
        timestamp: 1,
        userId: "user-1",
      },
      {
        id: "evt-2",
        type: "ITEM_UPDATED",
        payload: {
          id: doc.id,
          changes: { data: { markdown: "hello world" } as Item["data"] },
        },
        timestamp: 2,
        userId: "user-1",
      },
      {
        id: "evt-3",
        type: "BULK_ITEMS_CREATED",
        payload: { items: [note] },
        timestamp: 3,
        userId: "user-1",
      },
      {
        id: "evt-4",
        type: "FOLDER_CREATED_WITH_ITEMS",
        payload: { folder, itemIds: [doc.id] },
        timestamp: 4,
        userId: "user-1",
      },
      {
        id: "evt-5",
        type: "BULK_ITEMS_PATCHED",
        payload: {
          updates: [
            {
              id: note.id,
              changes: { data: { markdown: "patched note" } as Item["data"] },
            },
          ],
        },
        timestamp: 5,
        userId: "user-1",
      },
      {
        id: "evt-6",
        type: "ITEM_DELETED",
        payload: { id: folder.id },
        timestamp: 6,
        userId: "user-1",
      },
    ];

    expect(applyEvents(events)).toEqual(events.reduce(eventReducer, []));
  });

  it("clears child folder and layout when bulk deleting folders", () => {
    const current: Item[] = [
      {
        id: "folder-1",
        type: "folder",
        name: "Folder",
        subtitle: "",
        data: {},
      },
      {
        id: "doc-1",
        type: "document",
        name: "Doc",
        subtitle: "",
        folderId: "folder-1",
        layout: { lg: { x: 1, y: 1, w: 4, h: 3 } },
        data: { markdown: "doc" },
      },
    ];

    const changeSet = deriveWorkspaceProjectionChangeSet(current, {
      id: "evt-1",
      type: "BULK_ITEMS_UPDATED",
      payload: { deletedIds: ["folder-1"] },
      timestamp: 10,
      userId: "user-1",
    });

    expect(changeSet.deletedItemIds).toEqual(["folder-1"]);
    expect(changeSet.nextItems).toEqual([
      {
        id: "doc-1",
        type: "document",
        name: "Doc",
        subtitle: "",
        data: { markdown: "doc" },
      },
    ]);
  });

  it("routes OCR payloads into content and extracted projection rows", () => {
    const current: Item[] = [
      {
        id: "pdf-1",
        type: "pdf",
        name: "PDF",
        subtitle: "",
        data: { fileUrl: "https://a.test/a.pdf", filename: "a.pdf" },
      },
    ];

    const changeSet = deriveWorkspaceProjectionChangeSet(current, {
      id: "evt-1",
      type: "ITEM_UPDATED",
      payload: {
        id: "pdf-1",
        changes: {
          data: {
            ocrStatus: "complete",
            ocrPages: [{ index: 0, markdown: "page body" }],
          } as Item["data"],
        },
      },
      timestamp: 20,
      userId: "user-1",
    });

    const rows = buildWorkspaceItemTableRows({
      workspaceId: "ws-1",
      item: changeSet.upsertedItems[0],
      sourceVersion: 3,
      userId: "user-1",
    });

    expect(rows.content.assetData).toEqual({
      fileUrl: "https://a.test/a.pdf",
      filename: "a.pdf",
    });
    expect(rows.extracted.ocrPages).toEqual([
      { index: 0, markdown: "page body" },
    ]);
    expect(rows.extracted.ocrText).toBe("page body");
    expect(rows.item.ocrStatus).toBe("complete");
  });
});
