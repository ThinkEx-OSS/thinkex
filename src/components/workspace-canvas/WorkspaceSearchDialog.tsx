"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { ChevronRight, FolderOpen } from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";
import type { Item } from "@/lib/workspace-state/types";
import {
  rankWorkspaceSearchResults,
  getFolderPath,
} from "@/lib/workspace-state/search";
import { getCardTypeIcon } from "@/components/chat/WorkspaceItemPicker";
import { useUIStore } from "@/lib/stores/ui-store";

interface WorkspaceSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: Item[];
  currentWorkspaceId: string | null;
  isLoadingWorkspace: boolean;
}

export function WorkspaceSearchDialog({
  open,
  onOpenChange,
  items,
  currentWorkspaceId,
  isLoadingWorkspace,
}: WorkspaceSearchDialogProps) {
  const [query, setQuery] = useState("");
  const navigateToFolder = useUIStore((state) => state.navigateToFolder);
  const setActiveFolderId = useUIStore((state) => state.setActiveFolderId);
  const openWorkspaceItem = useUIStore((state) => state.openWorkspaceItem);

  const safeItems = items ?? [];

  // Reset query when workspace changes
  useEffect(() => {
    if (!open) return;
    setQuery("");
  }, [currentWorkspaceId, open]);

  const rankedResults = useMemo(
    () => rankWorkspaceSearchResults(safeItems, query),
    [safeItems, query]
  );

  const handleSelect = useCallback(
    (item: Item) => {
      // No-op if item not found (workspace switch / race)
      const exists = safeItems.some((i) => i.id === item.id);
      if (!exists) return;

      onOpenChange(false);

      if (item.type === "folder") {
        navigateToFolder(item.id);
      } else {
        // Ensure breadcrumb shows the item's folder, then open the item
        if (item.folderId) {
          setActiveFolderId(item.folderId);
        } else {
          setActiveFolderId(null);
        }
        openWorkspaceItem(item.id);
      }
    },
    [safeItems, onOpenChange, navigateToFolder, setActiveFolderId, openWorkspaceItem]
  );

  const getFolderPathItems = useCallback(
    (item: Item): Item[] => {
      if (!item.folderId) return [];
      return getFolderPath(item.folderId, safeItems);
    },
    [safeItems]
  );

  const emptyMessage = useMemo(() => {
    if (isLoadingWorkspace || !currentWorkspaceId) {
      return "Loading...";
    }
    if (safeItems.length === 0) {
      return "No items in this workspace.";
    }
    if (query.trim()) {
      return `No results for "${query}".`;
    }
    return "Type to search...";
  }, [isLoadingWorkspace, currentWorkspaceId, safeItems.length, query]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search workspace"
      description="Search for items and folders"
      shouldFilter={false}
    >
      <CommandInput
        placeholder="Search items..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{emptyMessage}</CommandEmpty>
        {rankedResults.map(({ item, matchType, contentSnippet }) => {
          const Icon = getCardTypeIcon(item.type);
          const folderPathItems = getFolderPathItems(item);
          const hasLocation = folderPathItems.length > 0;
          const hasContentSnippet = matchType === "content" && contentSnippet?.match;

          return (
            <CommandItem
              key={item.id}
              value={item.id}
              onSelect={() => handleSelect(item)}
            >
              {Icon}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate">{item.name || "Untitled"}</span>
                {/* Breadcrumb-style folder path (matches header breadcrumbs) */}
                {hasLocation && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0 overflow-hidden">
                    {folderPathItems.map((folder, idx) => (
                      <span key={folder.id} className="flex items-center gap-1 shrink-0">
                        {idx > 0 && (
                          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                        )}
                        <FolderOpen
                          className="h-3 w-3 shrink-0"
                          style={{ color: folder.color ?? undefined }}
                        />
                        <span className="truncate">{folder.name}</span>
                      </span>
                    ))}
                  </div>
                )}
                {/* Content match snippet with bold matching text */}
                {hasContentSnippet && contentSnippet && (
                  <div className="text-xs text-muted-foreground line-clamp-2">
                    {contentSnippet.before && (
                      <span>{contentSnippet.before}</span>
                    )}
                    <span className="font-semibold text-foreground/90">
                      {contentSnippet.match}
                    </span>
                    {contentSnippet.after && (
                      <span>{contentSnippet.after}</span>
                    )}
                  </div>
                )}
                {/* Subtitle when no location or content snippet */}
                {item.subtitle && !hasLocation && !hasContentSnippet && (
                  <span className="truncate text-xs text-muted-foreground">
                    {item.subtitle}
                  </span>
                )}
              </div>
            </CommandItem>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
