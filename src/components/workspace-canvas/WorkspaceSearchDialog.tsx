"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { ChevronRight, FolderOpen } from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import type { Item } from "@/lib/workspace-state/types";
import {
  rankWorkspaceSearchResults,
  getFolderPath,
} from "@/lib/workspace-state/search";
import { getCardTypeIcon } from "@/components/chat/WorkspaceItemPicker";
import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceView } from "@/hooks/workspace/use-workspace-view";

const EMPTY_ITEMS: Item[] = [];

interface WorkspaceSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: Item[];
  currentWorkspaceId: string | null;
}

export function WorkspaceSearchDialog({
  open,
  onOpenChange,
  items,
  currentWorkspaceId,
}: WorkspaceSearchDialogProps) {
  const view = useWorkspaceView();
  const isLoadingWorkspace = view.kind === "loading";
  const [query, setQuery] = useState("");
  const navigateToFolder = useUIStore((state) => state.navigateToFolder);
  const setActiveFolderId = useUIStore((state) => state.setActiveFolderId);
  const openWorkspaceItem = useUIStore((state) => state.openWorkspaceItem);

  const safeItems = items ?? EMPTY_ITEMS;
  const [semanticItemIds, setSemanticItemIds] = useState<string[]>([]);
  const [semanticLoading, setSemanticLoading] = useState(false);

  // Reset query when workspace changes
  useEffect(() => {
    if (!open) return;
    setQuery("");
  }, [currentWorkspaceId, open]);

  // Reset semantic results when dialog closes
  useEffect(() => {
    if (!open) {
      setSemanticItemIds([]);
      setSemanticLoading(false);
    }
  }, [open]);

  const rankedResults = useMemo(
    () => rankWorkspaceSearchResults(safeItems, query),
    [safeItems, query]
  );

  // Debounced semantic search
  useEffect(() => {
    if (!query.trim() || !currentWorkspaceId) {
      setSemanticItemIds([]);
      setSemanticLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setSemanticLoading(true);
      try {
        const res = await fetch(
          `/api/workspaces/${currentWorkspaceId}/search`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query }),
            signal: controller.signal,
          },
        );
        if (res.ok) {
          const { itemIds } = await res.json();
          setSemanticItemIds(itemIds ?? []);
        } else {
          setSemanticItemIds([]);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setSemanticItemIds([]);
      } finally {
        setSemanticLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, currentWorkspaceId]);

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

  const exactResultIds = useMemo(
    () => new Set(rankedResults.map((r) => r.item.id)),
    [rankedResults],
  );

  const similarItems = useMemo(
    () =>
      semanticItemIds
        .filter((id) => !exactResultIds.has(id))
        .map((id) => safeItems.find((i) => i.id === id))
        .filter(Boolean) as Item[],
    [semanticItemIds, exactResultIds, safeItems],
  );

  const getFolderPathItems = useCallback(
    (item: Item): Item[] => {
      if (!item.folderId) return [];
      return getFolderPath(item.folderId, safeItems);
    },
    [safeItems]
  );

  const emptyMessage = useMemo(() => {
    if (
      view.kind === "denied" ||
      view.kind === "unauthenticated" ||
      view.kind === "error"
    ) {
      return "Workspace unavailable.";
    }
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
  }, [view.kind, isLoadingWorkspace, currentWorkspaceId, safeItems.length, query]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search workspace"
      description="Search for items and folders"
      shouldFilter={false}
      className="top-[30%] translate-y-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
    >
      <CommandInput
        placeholder="Search items..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{emptyMessage}</CommandEmpty>
        {rankedResults.length > 0 && (
        <CommandGroup heading={similarItems.length > 0 ? "Best Matches" : undefined}>
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
                  {item.subtitle && !hasLocation && !hasContentSnippet && (
                    <span className="truncate text-xs text-muted-foreground">
                      {item.subtitle}
                    </span>
                  )}
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
        )}
        {similarItems.length > 0 && (
          <CommandGroup heading="Similar Content">
            {similarItems.map((item) => {
              const Icon = getCardTypeIcon(item.type);
              const folderPathItems = getFolderPathItems(item);
              const hasLocation = folderPathItems.length > 0;
              return (
                <CommandItem
                  key={item.id}
                  value={`similar-${item.id}`}
                  onSelect={() => handleSelect(item)}
                >
                  {Icon}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate">{item.name || "Untitled"}</span>
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
                    {item.subtitle && !hasLocation && (
                      <span className="truncate text-xs text-muted-foreground">
                        {item.subtitle}
                      </span>
                    )}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
        {semanticLoading && !similarItems.length && query.trim() && (
          <p className="py-2 px-4 text-xs text-muted-foreground">
            Searching similar content...
          </p>
        )}
      </CommandList>
    </CommandDialog>
  );
}
