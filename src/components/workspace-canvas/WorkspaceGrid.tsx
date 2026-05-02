import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import React from "react";
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { arrayMove } from "@dnd-kit/helpers";
import { isSortable } from "@dnd-kit/react/sortable";
import type { Item } from "@/lib/workspace-state/types";
import { WorkspaceCard } from "./WorkspaceCard";
import { FlashcardWorkspaceCard } from "./FlashcardWorkspaceCard";
import { FolderCard } from "./FolderCard";
import {
  getWorkspaceSortableGroup,
  type WorkspaceGridLane,
  SortableWorkspaceGridItem,
} from "./SortableWorkspaceGridItem";

interface WorkspaceGridProps {
  folderItems: Item[];
  contentItems: Item[];
  allItems: Item[];
  onUpdateItem: (itemId: string, updates: Partial<Item>) => void;
  onDeleteItem: (itemId: string) => void;
  onOpenModal: (itemId: string) => void;
  workspaceName: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
  onMoveItem?: (itemId: string, folderId: string | null) => void;
  onOpenFolder?: (folderId: string) => void;
  onDeleteFolderWithContents?: (folderId: string) => void;
  onReorderItems?: (orderedItemIds: string[]) => void;
}

const GRID_ITEM_CLASS = "min-w-0 aspect-[4/3]";

const GRID_COLUMNS_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-4";

function WorkspaceGridComponent({
  folderItems,
  contentItems,
  allItems,
  onUpdateItem,
  onDeleteItem,
  onOpenModal,
  workspaceName,
  workspaceIcon,
  workspaceColor,
  onMoveItem,
  onOpenFolder,
  onDeleteFolderWithContents,
  onReorderItems,
}: WorkspaceGridProps) {
  const [orderedFolderItems, setOrderedFolderItems] = useState(folderItems);
  const [orderedContentItems, setOrderedContentItems] = useState(contentItems);
  const dragSnapshotRef = useRef<{
    folders: Item[];
    items: Item[];
  } | null>(null);
  const isDraggingRef = useRef(false);
  const currentContainerId = folderItems[0]?.folderId ?? contentItems[0]?.folderId ?? null;

  const handleUpdateItem = useCallback(
    (itemId: string, updates: Partial<Item>) => {
      onUpdateItem(itemId, updates);
    },
    [onUpdateItem],
  );

  const handleDeleteItem = useCallback(
    (itemId: string) => {
      onDeleteItem(itemId);
    },
    [onDeleteItem],
  );

  const handleOpenModal = useCallback(
    (itemId: string) => {
      onOpenModal(itemId);
    },
    [onOpenModal],
  );

  const handleOpenFolder = useCallback(
    (folderId: string) => {
      onOpenFolder?.(folderId);
    },
    [onOpenFolder],
  );

  useEffect(() => {
    if (isDraggingRef.current) {
      return;
    }

    setOrderedFolderItems(folderItems);
  }, [folderItems]);

  useEffect(() => {
    if (isDraggingRef.current) {
      return;
    }

    setOrderedContentItems(contentItems);
  }, [contentItems]);

  const folderItemCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allItems.forEach((item) => {
      if (item.folderId) {
        counts.set(item.folderId, (counts.get(item.folderId) || 0) + 1);
      }
    });
    return counts;
  }, [allItems]);

  const getLaneFromGroup = useCallback((group: string | number | undefined) => {
    if (typeof group !== "string") {
      return null;
    }

    if (group.endsWith(":folders")) {
      return "folders" as const;
    }

    if (group.endsWith(":items")) {
      return "items" as const;
    }

    return null;
  }, []);

  const commitLaneOrder = useCallback(
    (lane: WorkspaceGridLane, nextItems: Item[]) => {
      if (lane === "folders") {
        setOrderedFolderItems(nextItems);
      } else {
        setOrderedContentItems(nextItems);
      }

      onReorderItems?.(nextItems.map((item) => item.id));
    },
    [onReorderItems],
  );

  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
    dragSnapshotRef.current = {
      folders: orderedFolderItems,
      items: orderedContentItems,
    };
  }, [orderedContentItems, orderedFolderItems]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const snapshot = dragSnapshotRef.current;
      isDraggingRef.current = false;
      dragSnapshotRef.current = null;

      if (!snapshot) {
        return;
      }

      if (event.canceled) {
        setOrderedFolderItems(snapshot.folders);
        setOrderedContentItems(snapshot.items);
        return;
      }

      const { source } = event.operation;

      if (!isSortable(source)) {
        setOrderedFolderItems(snapshot.folders);
        setOrderedContentItems(snapshot.items);
        return;
      }

      const { initialIndex, index, initialGroup, group } = source;

      if (
        initialGroup == null ||
        group == null ||
        initialGroup !== group ||
        initialIndex === index
      ) {
        setOrderedFolderItems(snapshot.folders);
        setOrderedContentItems(snapshot.items);
        return;
      }

      const lane = getLaneFromGroup(
        typeof group === "string" ? group : String(group),
      );

      if (!lane) {
        setOrderedFolderItems(snapshot.folders);
        setOrderedContentItems(snapshot.items);
        return;
      }

      const nextItems = arrayMove(
        lane === "folders" ? snapshot.folders : snapshot.items,
        initialIndex,
        index,
      );

      commitLaneOrder(lane, nextItems);
    },
    [commitLaneOrder, getLaneFromGroup],
  );

  const folderChildren = useMemo(() => {
    return orderedFolderItems.map((item, index) => (
      <SortableWorkspaceGridItem
        key={item.id}
        item={item}
        index={index}
        lane="folders"
        containerId={currentContainerId}
        className={GRID_ITEM_CLASS}
      >
        {({ dragHandle }) => (
          <FolderCard
            item={item}
            itemCount={folderItemCounts.get(item.id) || 0}
            allItems={allItems}
            workspaceName={workspaceName}
            workspaceIcon={workspaceIcon}
            workspaceColor={workspaceColor}
            onOpenFolder={handleOpenFolder}
            onUpdateItem={handleUpdateItem}
            onDeleteItem={handleDeleteItem}
            onDeleteFolderWithContents={onDeleteFolderWithContents}
            onMoveItem={onMoveItem}
            dragHandle={dragHandle}
          />
        )}
      </SortableWorkspaceGridItem>
    ));
  }, [
    allItems,
    currentContainerId,
    folderItemCounts,
    handleDeleteItem,
    handleOpenFolder,
    handleUpdateItem,
    onDeleteFolderWithContents,
    onMoveItem,
    orderedFolderItems,
    workspaceColor,
    workspaceIcon,
    workspaceName,
  ]);

  const contentChildren = useMemo(() => {
    return orderedContentItems.map((item, index) => {
      if (item.type === "flashcard") {
        return (
          <SortableWorkspaceGridItem
            key={item.id}
            item={item}
            index={index}
            lane="items"
            containerId={currentContainerId}
            className={GRID_ITEM_CLASS}
          >
            {({ dragHandle }) => (
              <FlashcardWorkspaceCard
                item={item}
                allItems={allItems}
                workspaceName={workspaceName}
                workspaceIcon={workspaceIcon}
                workspaceColor={workspaceColor}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onOpenModal={handleOpenModal}
                onMoveItem={onMoveItem}
                dragHandle={dragHandle}
              />
            )}
          </SortableWorkspaceGridItem>
        );
      }

      return (
        <SortableWorkspaceGridItem
          key={item.id}
          item={item}
          index={index}
          lane="items"
          containerId={currentContainerId}
          className={GRID_ITEM_CLASS}
        >
          {({ dragHandle }) => (
            <WorkspaceCard
              item={item}
              allItems={allItems}
              workspaceName={workspaceName}
              workspaceIcon={workspaceIcon}
              workspaceColor={workspaceColor}
              onUpdateItem={handleUpdateItem}
              onDeleteItem={handleDeleteItem}
              onOpenModal={handleOpenModal}
              onMoveItem={onMoveItem}
              dragHandle={dragHandle}
            />
          )}
        </SortableWorkspaceGridItem>
      );
    });
  }, [
    allItems,
    currentContainerId,
    handleDeleteItem,
    handleOpenModal,
    handleUpdateItem,
    onMoveItem,
    orderedContentItems,
    workspaceColor,
    workspaceIcon,
    workspaceName,
  ]);

  return (
    <DragDropProvider onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="w-full workspace-grid-container px-4 sm:px-6">
        <div className="flex flex-col gap-4">
          {folderChildren.length > 0 ? (
            <div
              data-workspace-sortable-group={getWorkspaceSortableGroup(
                currentContainerId,
                "folders",
              )}
              className={GRID_COLUMNS_CLASS}
            >
              {folderChildren}
            </div>
          ) : null}
          {contentChildren.length > 0 ? (
            <div
              data-workspace-sortable-group={getWorkspaceSortableGroup(
                currentContainerId,
                "items",
              )}
              className={GRID_COLUMNS_CLASS}
            >
              {contentChildren}
            </div>
          ) : null}
        </div>
      </div>
    </DragDropProvider>
  );
}

export const WorkspaceGrid = React.memo(WorkspaceGridComponent);
WorkspaceGrid.displayName = "WorkspaceGrid";
