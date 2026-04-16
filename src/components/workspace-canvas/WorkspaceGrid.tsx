import React, { useCallback, useMemo, useState } from "react";
import { DragDropProvider } from "@dnd-kit/react";
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
    accept: "item",
    group: "items",
    type: "item",
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

function SortableFolderCard({
  id,
  index,
  isDropHovered,
  children,
}: {
  id: string;
  index: number;
  isDropHovered: boolean;
  children: React.ReactNode;
}) {
  const [element, setElement] = useState<Element | null>(null);
  const { isDragging } = useSortable({
    id,
    index,
    element,
    accept: "folder",
    group: "folders",
    type: "folder",
  });

  return (
    <div
      ref={setElement}
      className="size-full min-w-0 transition-[outline] duration-150"
      data-workspace-card
      data-folder-id={id}
      style={{
        opacity: isDragging ? 0.4 : 1,
        cursor: "grab",
        outline: isDropHovered
          ? "2px solid hsl(var(--primary))"
          : "2px solid transparent",
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
  const [hoveredFolderId, setHoveredFolderId] = useState<string | null>(null);

  const folders = useMemo(
    () => items.filter((item) => item.type === "folder"),
    [items],
  );

  const nonFolderItems = useMemo(
    () => items.filter((item) => item.type !== "folder"),
    [items],
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
    setHoveredFolderId(null);
    onGridDragStateChange?.(true);
  }, [onGridDragStateChange]);

  const handleDragMove = useCallback(
    (
      event: Parameters<
        NonNullable<React.ComponentProps<typeof DragDropProvider>["onDragMove"]>
      >[0],
    ) => {
      const sourceId = event.operation.source?.id;
      if (typeof sourceId !== "string") {
        setHoveredFolderId(null);
        return;
      }

      const draggedItem = items.find((item) => item.id === sourceId);
      if (!draggedItem || draggedItem.type === "folder") {
        setHoveredFolderId(null);
        return;
      }

      if (typeof document === "undefined") {
        setHoveredFolderId(null);
        return;
      }

      const position = event.operation.position.current;
      const elements = document.elementsFromPoint(position.x, position.y);
      let foundFolderId: string | null = null;

      for (const element of elements) {
        const folderElement = element.closest("[data-folder-id]");
        if (folderElement instanceof HTMLElement) {
          foundFolderId = folderElement.getAttribute("data-folder-id");
          break;
        }
      }

      setHoveredFolderId((currentFolderId) =>
        currentFolderId === foundFolderId ? currentFolderId : foundFolderId,
      );
    },
    [items],
  );

  const handleDragEnd = useCallback(
    (
      event: Parameters<
        NonNullable<React.ComponentProps<typeof DragDropProvider>["onDragEnd"]>
      >[0],
    ) => {
      const currentHoveredFolderId = hoveredFolderId;
      setHoveredFolderId(null);
      onGridDragStateChange?.(false);

      if (event.canceled) {
        return;
      }

      const sourceId = event.operation.source?.id;
      if (typeof sourceId !== "string") {
        return;
      }

      if (currentHoveredFolderId) {
        const draggedItem = items.find((item) => item.id === sourceId);
        if (
          draggedItem &&
          draggedItem.type !== "folder" &&
          sourceId !== currentHoveredFolderId
        ) {
          onMoveItem?.(sourceId, currentHoveredFolderId);
        }
        return;
      }

      const draggedItem = items.find((item) => item.id === sourceId);
      if (!draggedItem) {
        return;
      }

      if (draggedItem.type === "folder") {
        const reorderedFolders = move(folders, event);
        if (reorderedFolders === folders) {
          return;
        }

        const reorderedVisibleItems = [...reorderedFolders, ...nonFolderItems];
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
        return;
      }

      const reorderedItems = move(nonFolderItems, event);
      if (reorderedItems === nonFolderItems) {
        return;
      }

      const reorderedVisibleItems = [...folders, ...reorderedItems];
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
    [
      allItems,
      folders,
      hoveredFolderId,
      items,
      nonFolderItems,
      onGridDragStateChange,
      onMoveItem,
      onUpdateAllItems,
    ],
  );

  return (
    <div className="w-full workspace-grid-container p-4">
      <DragDropProvider
        onBeforeDragStart={handleBeforeDragStart}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      >
        {folders.length > 0 ? (
          <div
            className="grid mb-4 gap-4"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gridAutoRows: "200px",
            }}
          >
            {folders.map((item, index) => (
              <SortableFolderCard
                key={item.id}
                id={item.id}
                index={index}
                isDropHovered={hoveredFolderId === item.id}
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
              </SortableFolderCard>
            ))}
          </div>
        ) : null}

        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gridAutoRows: "200px",
            gridAutoFlow: "dense",
          }}
        >
          {nonFolderItems.map((item, index) =>
            item.type === "flashcard" ? (
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
            ) : item.type !== "folder" ? (
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
            ) : null,
          )}
        </div>
      </DragDropProvider>
    </div>
  );
}

export const WorkspaceGrid = React.memo(WorkspaceGridComponent);
WorkspaceGrid.displayName = "WorkspaceGrid";
