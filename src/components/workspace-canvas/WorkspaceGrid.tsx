import { useCallback, useMemo } from "react";
import React from "react";
import type { Item } from "@/lib/workspace-state/types";
import { WorkspaceCard } from "./WorkspaceCard";
import { FlashcardWorkspaceCard } from "./FlashcardWorkspaceCard";
import { FolderCard } from "./FolderCard";

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

  const folderChildren = useMemo(() => {
    return folderItems.map((item) => (
      <div key={item.id} className={GRID_ITEM_CLASS}>
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
    ));
  }, [
    allItems,
    folderItemCounts,
    folderItems,
    handleDeleteItem,
    handleOpenFolder,
    handleUpdateItem,
    onDeleteFolderWithContents,
    onMoveItem,
    workspaceColor,
    workspaceIcon,
    workspaceName,
  ]);

  const contentChildren = useMemo(() => {
    return contentItems.map((item) => {
      if (item.type === "flashcard") {
        return (
          <div key={item.id} className={GRID_ITEM_CLASS}>
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
        <div key={item.id} className={GRID_ITEM_CLASS}>
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
    contentItems,
    handleDeleteItem,
    handleOpenModal,
    handleUpdateItem,
    onMoveItem,
    workspaceColor,
    workspaceIcon,
    workspaceName,
  ]);

  return (
    <div className="w-full workspace-grid-container px-4 sm:px-6">
      <div className="flex flex-col gap-4">
        {folderChildren.length > 0 ? (
          <div className={GRID_COLUMNS_CLASS}>{folderChildren}</div>
        ) : null}
        {contentChildren.length > 0 ? (
          <div className={GRID_COLUMNS_CLASS}>{contentChildren}</div>
        ) : null}
      </div>
    </div>
  );
}

export const WorkspaceGrid = React.memo(WorkspaceGridComponent);
WorkspaceGrid.displayName = "WorkspaceGrid";
