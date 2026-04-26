import { useCallback, useMemo } from "react";
import React from "react";
import type { Item } from "@/lib/workspace-state/types";
import { WorkspaceCard } from "./WorkspaceCard";
import { FlashcardWorkspaceCard } from "./FlashcardWorkspaceCard";
import { FolderCard } from "./FolderCard";

interface WorkspaceGridProps {
  items: Item[];
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
}

const GRID_ITEM_HEIGHTS: Record<Item["type"], string> = {
  pdf: "min-h-[22rem]",
  flashcard: "min-h-[24rem]",
  folder: "min-h-[14rem]",
  youtube: "min-h-[22rem]",
  quiz: "min-h-[28rem]",
  image: "min-h-[22rem]",
  audio: "min-h-[22rem]",
  website: "min-h-[14rem]",
  document: "min-h-[22rem]",
};

function WorkspaceGridComponent({
  items,
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
}: WorkspaceGridProps) {
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

  const folderItemCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allItems.forEach((item) => {
      if (item.folderId) {
        counts.set(item.folderId, (counts.get(item.folderId) || 0) + 1);
      }
    });
    return counts;
  }, [allItems]);

  const children = useMemo(() => {
    return items.map((item) => {
      const wrapperClass = `min-w-0 ${GRID_ITEM_HEIGHTS[item.type]}`;

      if (item.type === "folder") {
        return (
          <div key={item.id} className={wrapperClass}>
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
            />
          </div>
        );
      }

      if (item.type === "flashcard") {
        return (
          <div key={item.id} className={wrapperClass}>
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
            />
          </div>
        );
      }

      return (
        <div key={item.id} className={wrapperClass}>
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
          />
        </div>
      );
    });
  }, [
    allItems,
    folderItemCounts,
    handleDeleteItem,
    handleOpenFolder,
    handleOpenModal,
    handleUpdateItem,
    items,
    onDeleteFolderWithContents,
    onMoveItem,
    workspaceColor,
    workspaceIcon,
    workspaceName,
  ]);

  return (
    <div className="w-full workspace-grid-container px-4 sm:px-6">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4">
        {children}
      </div>
    </div>
  );
}

export const WorkspaceGrid = React.memo(WorkspaceGridComponent);
WorkspaceGrid.displayName = "WorkspaceGrid";
