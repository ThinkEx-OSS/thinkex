import { describe, expect, it } from "vitest";
import type { Item } from "@/lib/workspace-state/types";
import { resolveWorkspaceGridDragEnd } from "./workspace-grid-dnd";

function createItem(
  overrides: Partial<Item> & Pick<Item, "id" | "type">,
): Item {
  return {
    id: overrides.id,
    type: overrides.type,
    name: overrides.name ?? overrides.id,
    subtitle: overrides.subtitle ?? "",
    data:
      overrides.data ?? (overrides.type === "folder" ? {} : { markdown: "" }),
    folderId: overrides.folderId,
    sortOrder: overrides.sortOrder,
  } as Item;
}

describe("resolveWorkspaceGridDragEnd", () => {
  it("moves a non-folder item into a folder card target", () => {
    const itemA = createItem({ id: "doc-a", type: "document", sortOrder: 0 });
    const itemB = createItem({ id: "doc-b", type: "document", sortOrder: 1 });
    const folder = createItem({ id: "folder-1", type: "folder", sortOrder: 0 });

    const result = resolveWorkspaceGridDragEnd({
      snapshot: {
        folders: [folder],
        items: [itemA, itemB],
      },
      source: {
        type: "item",
        data: {
          itemId: "doc-a",
          containerId: null,
        },
        initialIndex: 0,
        index: 0,
        initialGroup: "root:items",
        group: "root:items",
      },
      targetData: {
        kind: "folder-card-drop-target",
        folderId: "folder-1",
      },
    });

    expect(result).toEqual({
      kind: "move-to-folder",
      itemId: "doc-a",
      folderId: "folder-1",
      sourceLane: "items",
      nextItems: [itemB],
    });
  });

  it("no-ops when dropping an item onto its current parent folder", () => {
    const item = createItem({
      id: "doc-a",
      type: "document",
      folderId: "folder-1",
      sortOrder: 0,
    });

    const result = resolveWorkspaceGridDragEnd({
      snapshot: {
        folders: [],
        items: [item],
      },
      source: {
        type: "item",
        data: {
          itemId: "doc-a",
          containerId: "folder-1",
        },
        initialIndex: 0,
        index: 0,
        initialGroup: "folder-1:items",
        group: "folder-1:items",
      },
      targetData: {
        kind: "folder-card-drop-target",
        folderId: "folder-1",
      },
    });

    expect(result).toEqual({ kind: "reset" });
  });

  it("moves an item to the workspace root from a breadcrumb root target", () => {
    const item = createItem({
      id: "doc-a",
      type: "document",
      folderId: "folder-1",
      sortOrder: 0,
    });

    const result = resolveWorkspaceGridDragEnd({
      snapshot: {
        folders: [],
        items: [item],
      },
      source: {
        type: "item",
        data: {
          itemId: "doc-a",
          containerId: "folder-1",
        },
        initialIndex: 0,
        index: 0,
        initialGroup: "folder-1:items",
        group: "folder-1:items",
      },
      targetData: {
        kind: "breadcrumb-root-drop-target",
      },
    });

    expect(result).toEqual({
      kind: "move-to-folder",
      itemId: "doc-a",
      folderId: null,
      sourceLane: "items",
      nextItems: [],
    });
  });

  it("no-ops when dropping a root item onto the root breadcrumb", () => {
    const item = createItem({
      id: "doc-a",
      type: "document",
      sortOrder: 0,
    });

    const result = resolveWorkspaceGridDragEnd({
      snapshot: {
        folders: [],
        items: [item],
      },
      source: {
        type: "item",
        data: {
          itemId: "doc-a",
          containerId: null,
        },
        initialIndex: 0,
        index: 0,
        initialGroup: "root:items",
        group: "root:items",
      },
      targetData: {
        kind: "breadcrumb-root-drop-target",
      },
    });

    expect(result).toEqual({ kind: "reset" });
  });

  it("keeps same-lane item reorder behavior", () => {
    const itemA = createItem({ id: "doc-a", type: "document", sortOrder: 0 });
    const itemB = createItem({ id: "doc-b", type: "document", sortOrder: 1 });
    const itemC = createItem({ id: "doc-c", type: "document", sortOrder: 2 });

    const result = resolveWorkspaceGridDragEnd({
      snapshot: {
        folders: [],
        items: [itemA, itemB, itemC],
      },
      source: {
        type: "item",
        data: {
          itemId: "doc-a",
          containerId: null,
        },
        initialIndex: 0,
        index: 2,
        initialGroup: "root:items",
        group: "root:items",
      },
    });

    expect(result).toEqual({
      kind: "reorder",
      lane: "items",
      nextItems: [itemB, itemC, itemA],
    });
  });

  it("keeps same-lane folder reorder behavior", () => {
    const folderA = createItem({
      id: "folder-a",
      type: "folder",
      sortOrder: 0,
    });
    const folderB = createItem({
      id: "folder-b",
      type: "folder",
      sortOrder: 1,
    });

    const result = resolveWorkspaceGridDragEnd({
      snapshot: {
        folders: [folderA, folderB],
        items: [],
      },
      source: {
        type: "folder",
        data: {
          itemId: "folder-a",
          containerId: null,
        },
        initialIndex: 0,
        index: 1,
        initialGroup: "root:folders",
        group: "root:folders",
      },
      targetData: {
        kind: "folder-card-drop-target",
        folderId: "folder-b",
      },
    });

    expect(result).toEqual({
      kind: "reorder",
      lane: "folders",
      nextItems: [folderB, folderA],
    });
  });
});
