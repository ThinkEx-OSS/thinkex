import { arrayMove } from "@dnd-kit/helpers";
import type { Item } from "@/lib/workspace-state/types";
import type { WorkspaceGridLane } from "./SortableWorkspaceGridItem";

export type FolderCardDropTargetData = {
  kind?: string;
  folderId?: string;
};

export type WorkspaceGridDragSource = {
  type?: unknown;
  data?: {
    itemId?: unknown;
    containerId?: unknown;
  };
  initialIndex: number;
  index: number;
  initialGroup?: string | number | null;
  group?: string | number | null;
};

export type WorkspaceGridDragResolution =
  | {
      kind: "reset";
    }
  | {
      kind: "move-to-folder";
      itemId: string;
      folderId: string;
      sourceLane: WorkspaceGridLane;
      nextItems: Item[];
    }
  | {
      kind: "reorder";
      lane: WorkspaceGridLane;
      nextItems: Item[];
    };

export function resolveWorkspaceGridDragEnd(params: {
  snapshot: {
    folders: Item[];
    items: Item[];
  };
  source: WorkspaceGridDragSource;
  targetData?: FolderCardDropTargetData;
}): WorkspaceGridDragResolution {
  const { snapshot, source, targetData } = params;
  const sourceItemId =
    typeof source.data?.itemId === "string" ? source.data.itemId : null;
  const sourceContainerId =
    typeof source.data?.containerId === "string"
      ? source.data.containerId
      : null;

  if (
    sourceItemId &&
    targetData?.kind === "folder-card-drop-target" &&
    typeof targetData.folderId === "string"
  ) {
    const targetFolderId = targetData.folderId;

    if (sourceItemId === targetFolderId) {
      return { kind: "reset" };
    }
    if (sourceContainerId === targetFolderId) {
      return { kind: "reset" };
    }

    const sourceLane: WorkspaceGridLane = source.type === "folder" ? "folders" : "items";
    const affectedList = sourceLane === "folders" ? snapshot.folders : snapshot.items;

    return {
      kind: "move-to-folder",
      itemId: sourceItemId,
      folderId: targetFolderId,
      sourceLane,
      nextItems: affectedList.filter((item) => item.id !== sourceItemId),
    };
  }

  const { initialIndex, index, initialGroup, group } = source;

  if (
    initialGroup == null ||
    group == null ||
    initialGroup !== group ||
    initialIndex === index
  ) {
    return { kind: "reset" };
  }

  const groupName = typeof group === "string" ? group : String(group);
  let lane: WorkspaceGridLane | null = null;

  if (groupName.endsWith(":folders")) {
    lane = "folders";
  } else if (groupName.endsWith(":items")) {
    lane = "items";
  }

  if (!lane) {
    return { kind: "reset" };
  }

  return {
    kind: "reorder",
    lane,
    nextItems: arrayMove(
      lane === "folders" ? snapshot.folders : snapshot.items,
      initialIndex,
      index,
    ),
  };
}
