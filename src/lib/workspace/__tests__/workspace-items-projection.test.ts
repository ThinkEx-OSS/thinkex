import { describe, expect, it } from "vitest";
import { replayEvents } from "../event-reducer";
import type { WorkspaceEvent } from "../events";
import {
  applyEventToProjectedItems,
  didProjectedItemChange,
} from "../workspace-items-projection";
import type { Item } from "@/lib/workspace-state/types";

const workspaceId = "ws-projection-test";

function projectEvents(events: WorkspaceEvent[], initialItems: Item[] = []): Item[] {
  return events.reduce(
    (items, event) => applyEventToProjectedItems(items, workspaceId, event),
    initialItems,
  );
}

describe("workspace items projection parity", () => {
  it("matches replay for create, update, folder move, and folder delete flows", () => {
    const folder: Item = {
      id: "folder-1",
      type: "folder",
      name: "Folder",
      subtitle: "",
      data: {},
    };

    const document: Item = {
      id: "doc-1",
      type: "document",
      name: "Doc",
      subtitle: "",
      data: { markdown: "hello" },
      layout: { x: 0, y: 0, w: 2, h: 2 },
    };

    const events: WorkspaceEvent[] = [
      {
        id: "evt-1",
        type: "ITEM_CREATED",
        userId: "user-1",
        timestamp: 1,
        payload: { id: folder.id, item: folder },
      },
      {
        id: "evt-2",
        type: "ITEM_CREATED",
        userId: "user-1",
        timestamp: 2,
        payload: { id: document.id, item: document },
      },
      {
        id: "evt-3",
        type: "ITEM_UPDATED",
        userId: "user-1",
        timestamp: 3,
        payload: {
          id: document.id,
          changes: {
            data: { markdown: "hello world", sources: [{ title: "A", url: "https://a.test" }] } as Item["data"],
          },
        },
      },
      {
        id: "evt-4",
        type: "ITEM_MOVED_TO_FOLDER",
        userId: "user-1",
        timestamp: 4,
        payload: { itemId: document.id, folderId: folder.id },
      },
      {
        id: "evt-5",
        type: "ITEM_DELETED",
        userId: "user-1",
        timestamp: 5,
        payload: { id: folder.id },
      },
    ];

    const replayedItems = replayEvents(events, workspaceId).items;
    const projectedItems = projectEvents(events);

    expect(projectedItems).toEqual(replayedItems);
  });

  it("matches replay for seeded item creation followed by tail updates", () => {
    const seededItems: Item[] = [
      {
        id: "doc-1",
        type: "document",
        name: "Doc",
        subtitle: "",
        data: { markdown: "alpha" },
      },
      {
        id: "quiz-1",
        type: "quiz",
        name: "Quiz",
        subtitle: "",
        data: { questions: [] },
      },
    ];

    const events: WorkspaceEvent[] = [
      {
        id: "evt-seed",
        type: "BULK_ITEMS_CREATED",
        userId: "user-1",
        timestamp: 1,
        payload: { items: seededItems },
      },
      {
        id: "evt-tail",
        type: "ITEM_UPDATED",
        userId: "user-1",
        timestamp: 2,
        payload: {
          id: "doc-1",
          changes: {
            data: { markdown: "beta" } as Item["data"],
            name: "Doc 2",
          },
        },
      },
    ];

    const replayedItems = replayEvents(events, workspaceId).items;
    const projectedItems = projectEvents(events);

    expect(projectedItems).toEqual(replayedItems);
  });

  it("matches replay for bulk patch, layout, and bulk delete sequences", () => {
    const doc: Item = {
      id: "doc-1",
      type: "document",
      name: "Doc",
      subtitle: "",
      data: { markdown: "start" },
      layout: { x: 0, y: 0, w: 2, h: 2 },
    };
    const pdf: Item = {
      id: "pdf-1",
      type: "pdf",
      name: "Pdf",
      subtitle: "",
      data: {
        fileUrl: "https://example.com/file.pdf",
        filename: "file.pdf",
        ocrStatus: "processing",
      },
    };

    const events: WorkspaceEvent[] = [
      {
        id: "evt-1",
        type: "BULK_ITEMS_CREATED",
        userId: "user-1",
        timestamp: 1,
        payload: { items: [doc, pdf] },
      },
      {
        id: "evt-2",
        type: "BULK_ITEMS_PATCHED",
        userId: "user-1",
        timestamp: 2,
        payload: {
          updates: [
            {
              id: "doc-1",
              changes: {
                data: { markdown: "patched" } as Item["data"],
              },
            },
            {
              id: "pdf-1",
              changes: {
                data: {
                  ocrStatus: "complete",
                  ocrPages: [{ index: 0, markdown: "page" }],
                } as Item["data"],
              },
            },
          ],
        },
      },
      {
        id: "evt-3",
        type: "BULK_ITEMS_UPDATED",
        userId: "user-1",
        timestamp: 3,
        payload: {
          layoutUpdates: [{ id: "doc-1", x: 3, y: 4, w: 5, h: 6 }],
        },
      },
      {
        id: "evt-4",
        type: "BULK_ITEMS_UPDATED",
        userId: "user-1",
        timestamp: 4,
        payload: {
          deletedIds: ["pdf-1"],
        },
      },
    ];

    const replayedItems = replayEvents(events, workspaceId).items;
    const projectedItems = projectEvents(events);

    expect(projectedItems).toEqual(replayedItems);
  });

  it("treats matching items as unchanged when contents are identical", () => {
    const item: Item = {
      id: "doc-1",
      type: "document",
      name: "Doc",
      subtitle: "",
      data: { markdown: "same" },
    };

    expect(didProjectedItemChange(undefined, item)).toBe(true);
    expect(didProjectedItemChange(item, item)).toBe(false);
  });
});
