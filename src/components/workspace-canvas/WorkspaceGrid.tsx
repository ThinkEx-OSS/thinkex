import React, { useMemo } from "react";
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
  const folderItemCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allItems.forEach((item) => {
      if (item.folderId) {
        counts.set(item.folderId, (counts.get(item.folderId) || 0) + 1);
      }
    });
    return counts;
  }, [allItems]);

  return (
    <div className="w-full workspace-grid-container p-4">
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gridAutoRows: "200px",
          gridAutoFlow: "dense",
        }}
      >
        {items.map((item) => (
          <div key={item.id} data-workspace-card className="size-full min-w-0">
            {item.type === "folder" ? (
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
            ) : item.type === "flashcard" ? (
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
            ) : (
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
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export const WorkspaceGrid = React.memo(WorkspaceGridComponent);
WorkspaceGrid.displayName = "WorkspaceGrid";
