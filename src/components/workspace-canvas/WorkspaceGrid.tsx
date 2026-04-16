import React, { useCallback, useMemo, useState } from "react";
import { DragDropProvider, useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { move } from "@dnd-kit/helpers";
import type { Item } from "@/lib/workspace-state/types";
import { WorkspaceCard } from "./WorkspaceCard";
import { FlashcardWorkspaceCard } from "./FlashcardWorkspaceCard";
import { FolderCard } from "./FolderCard";

interface WorkspaceGridProps {
  items: Item[];
  allItems: Item[];
  isFiltered: boolean;
  isTemporaryFilter?: boolean;
  onUpdateItem: (itemId: string, updates: Partial<Item>) => void;
  onDeleteItem: (itemId: string) => void;
  onUpdateAllItems: (items: Item[]) => void;
  onOpenModal: (itemId: string) => void;
  onGridDragStateChange?: (isDragging: boolean) => void;
  workspaceName: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
  onMoveItem?: (itemId: string, folderId: string | null) => void;
  onMoveItems?: (itemIds: string[], folderId: string | null) => void;
  onOpenFolder?: (folderId: string) => void;
  onDeleteFolderWithContents?: (folderId: string) => void;
}

function SortableCard({
  id,
  index,
  children,
}: {
  id: string;
  index: number;
  children: React.ReactNode;
}) {
  const [element, setElement] = useState<Element | null>(null);
  const { isDragging } = useSortable({
    id,
    index,
    element,
  });

  return (
    <div
      ref={setElement}
      data-workspace-card
      className="size-full min-w-0"
      style={{ opacity: isDragging ? 0.4 : 1, cursor: "grab" }}
    >
      {children}
    </div>
  );
}

function DroppableFolderCard({
  id,
  index,
  canAcceptDrop,
  children,
}: {
  id: string;
  index: number;
  canAcceptDrop: (sourceId: string) => boolean;
  children: React.ReactNode;
}) {
  const [element, setElement] = useState<Element | null>(null);
  const { isDragging } = useSortable({
    id,
    index,
    element,
  });
  const [dropElement, setDropElement] = useState<Element | null>(null);
  const { isDropTarget } = useDroppable({
    id: `folder-drop-${id}`,
    element: dropElement,
    accept: (source) =>
      typeof source.id === "string" &&
      source.id !== id &&
      canAcceptDrop(source.id),
    collisionPriority: 100,
  });

  const setRefs = useCallback((nextElement: Element | null) => {
    setElement(nextElement);
    setDropElement(nextElement);
  }, []);

  return (
    <div
      ref={setRefs}
      data-workspace-card
      className="size-full min-w-0"
      style={{
        opacity: isDragging ? 0.4 : 1,
        cursor: "grab",
        outline: isDropTarget ? "2px solid hsl(var(--primary))" : "none",
        outlineOffset: "-2px",
        borderRadius: "1rem",
      }}
    >
      {children}
    </div>
  );
}

function WorkspaceGridComponent({
  items,
  allItems,
  onUpdateItem,
  onDeleteItem,
  onUpdateAllItems,
  onOpenModal,
  onGridDragStateChange,
  workspaceName,
  workspaceIcon,
  workspaceColor,
  onMoveItem,
  onOpenFolder,
  onDeleteFolderWithContents,
}: WorkspaceGridProps) {
  const folderItemCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allItems.forEach((item) => {
      if (item.folderId) {
        counts.set(item.folderId, (counts.get(item.folderId) || 0) + 1);
      }
    });
    return counts;
  }, [allItems]);

  const canAcceptDrop = useCallback(
    (sourceId: string) =>
      allItems.find((item) => item.id === sourceId)?.type !== "folder",
    [allItems],
  );

  const handleBeforeDragStart = useCallback(
    (
      event: Parameters<
        NonNullable<
          React.ComponentProps<typeof DragDropProvider>["onBeforeDragStart"]
        >
      >[0],
    ) => {
      const target = event.nativeEvent?.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (
        target.closest("button") ||
        target.closest("input") ||
        target.closest("textarea") ||
        target.closest('[contenteditable="true"]') ||
        target.closest('[data-slot="dropdown-menu-content"]') ||
        target.closest('[data-slot="dropdown-menu-trigger"]') ||
        target.closest('[role="menuitem"]')
      ) {
        event.preventDefault();
      }
    },
    [],
  );

  const handleDragStart = useCallback(() => {
    onGridDragStateChange?.(true);
  }, [onGridDragStateChange]);

  const handleDragEnd = useCallback(
    (
      event: Parameters<
        NonNullable<React.ComponentProps<typeof DragDropProvider>["onDragEnd"]>
      >[0],
    ) => {
      onGridDragStateChange?.(false);

      if (event.canceled) {
        return;
      }

      const sourceId = event.operation.source?.id;
      const targetId = event.operation.target?.id;
      if (typeof sourceId !== "string") {
        return;
      }

      const draggedItem = allItems.find((item) => item.id === sourceId);
      if (
        draggedItem &&
        draggedItem.type !== "folder" &&
        typeof targetId === "string" &&
        targetId.startsWith("folder-drop-")
      ) {
        const folderId = targetId.replace("folder-drop-", "");
        if (sourceId !== folderId) {
          onMoveItem?.(sourceId, folderId);
        }
        return;
      }

      const reorderedVisibleItems = move(items, event);
      if (reorderedVisibleItems === items) {
        return;
      }

      const reorderedIds = new Set(
        reorderedVisibleItems.map((item) => item.id),
      );
      const reorderedQueue = [...reorderedVisibleItems];
      const reorderedAllItems = allItems.map((item) =>
        reorderedIds.has(item.id) ? (reorderedQueue.shift() ?? item) : item,
      );

      if (
        reorderedAllItems.every(
          (item, index) => item.id === allItems[index]?.id,
        )
      ) {
        return;
      }

      onUpdateAllItems(reorderedAllItems);
    },
    [allItems, items, onGridDragStateChange, onMoveItem, onUpdateAllItems],
  );

  return (
    <div className="w-full workspace-grid-container p-4">
      <DragDropProvider
        onBeforeDragStart={handleBeforeDragStart}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gridAutoRows: "200px",
            gridAutoFlow: "dense",
          }}
        >
          {items.map((item, index) =>
            item.type === "folder" ? (
              <DroppableFolderCard
                key={item.id}
                id={item.id}
                index={index}
                canAcceptDrop={canAcceptDrop}
              >
                <FolderCard
                  item={item}
                  itemCount={folderItemCounts.get(item.id) || 0}
                  allItems={allItems}
                  workspaceName={workspaceName}
                  workspaceIcon={workspaceIcon}
                  workspaceColor={workspaceColor}
                  onOpenFolder={onOpenFolder!}
                  onUpdateItem={onUpdateItem}
                  onDeleteItem={onDeleteItem}
                  onDeleteFolderWithContents={onDeleteFolderWithContents}
                  onMoveItem={onMoveItem}
                />
              </DroppableFolderCard>
            ) : item.type === "flashcard" ? (
              <SortableCard key={item.id} id={item.id} index={index}>
                <FlashcardWorkspaceCard
                  item={item}
                  allItems={allItems}
                  workspaceName={workspaceName}
                  workspaceIcon={workspaceIcon}
                  workspaceColor={workspaceColor}
                  onUpdateItem={onUpdateItem}
                  onDeleteItem={onDeleteItem}
                  onOpenModal={onOpenModal}
                  onMoveItem={onMoveItem}
                />
              </SortableCard>
            ) : (
              <SortableCard key={item.id} id={item.id} index={index}>
                <WorkspaceCard
                  item={item}
                  allItems={allItems}
                  workspaceName={workspaceName}
                  workspaceIcon={workspaceIcon}
                  workspaceColor={workspaceColor}
                  onUpdateItem={onUpdateItem}
                  onDeleteItem={onDeleteItem}
                  onOpenModal={onOpenModal}
                  onMoveItem={onMoveItem}
                />
              </SortableCard>
            ),
          )}
        </div>
      </DragDropProvider>
    </div>
  );
}

export const WorkspaceGrid = React.memo(WorkspaceGridComponent);
WorkspaceGrid.displayName = "WorkspaceGrid";
