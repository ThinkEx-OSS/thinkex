"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Search, ChevronRight, FolderOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Item } from "@/lib/workspace-state/types";
import {
  rankWorkspaceSearchResults,
  getFolderPath,
  type ContentMatchSnippet,
} from "@/lib/workspace-state/search";
import { getCardTypeIcon } from "@/components/chat/WorkspaceItemPicker";
import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceView } from "@/hooks/workspace/use-workspace-view";

const KEYWORD_PAGE_SIZE = 10;
const SEMANTIC_PAGE_SIZE = 5;
const EMPTY_ITEMS: Item[] = [];

interface WorkspaceSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: Item[];
  currentWorkspaceId: string | null;
}

interface ResultItemProps {
  item: Item;
  matchType?: string;
  contentSnippet?: ContentMatchSnippet | null;
  folderPathItems: Item[];
  onSelect: (item: Item) => void;
}

function ResultItem({
  item,
  matchType,
  contentSnippet,
  folderPathItems,
  onSelect,
}: ResultItemProps) {
  const Icon = getCardTypeIcon(item.type);
  const hasLocation = folderPathItems.length > 0;
  const hasContentSnippet = matchType === "content" && contentSnippet?.match;

  return (
    <button
      data-item
      className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-accent text-left cursor-pointer focus:bg-accent focus:outline-none"
      onClick={() => onSelect(item)}
    >
      <span className="mt-0.5 shrink-0">{Icon}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm">{item.name || "Untitled"}</span>
        {hasLocation && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0 overflow-hidden">
            {folderPathItems.map((folder, idx) => (
              <span
                key={folder.id}
                className="flex items-center gap-1 shrink-0"
              >
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
            {contentSnippet.before && <span>{contentSnippet.before}</span>}
            <span className="font-semibold text-foreground/90">
              {contentSnippet.match}
            </span>
            {contentSnippet.after && <span>{contentSnippet.after}</span>}
          </div>
        )}
        {item.subtitle && !hasLocation && !hasContentSnippet && (
          <span className="truncate text-xs text-muted-foreground">
            {item.subtitle}
          </span>
        )}
      </div>
    </button>
  );
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
  const [semanticItemIds, setSemanticItemIds] = useState<string[]>([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [keywordLimit, setKeywordLimit] = useState(KEYWORD_PAGE_SIZE);
  const [semanticLimit, setSemanticLimit] = useState(SEMANTIC_PAGE_SIZE);

  const inputRef = useRef<HTMLInputElement>(null);
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);

  const navigateToFolder = useUIStore((state) => state.navigateToFolder);
  const setActiveFolderId = useUIStore((state) => state.setActiveFolderId);
  const openWorkspaceItem = useUIStore((state) => state.openWorkspaceItem);

  const safeItems = items ?? EMPTY_ITEMS;

  useEffect(() => {
    if (!open) return;
    setQuery("");
  }, [currentWorkspaceId, open]);

  useEffect(() => {
    if (!open) {
      setSemanticItemIds([]);
      setSemanticLoading(false);
    }
  }, [open]);

  useEffect(() => {
    setKeywordLimit(KEYWORD_PAGE_SIZE);
    setSemanticLimit(SEMANTIC_PAGE_SIZE);
  }, [query]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const allRankedResults = useMemo(
    () => rankWorkspaceSearchResults(safeItems, query),
    [safeItems, query],
  );

  const rankedResults = useMemo(
    () => allRankedResults.slice(0, keywordLimit),
    [allRankedResults, keywordLimit],
  );

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

  const exactResultIds = useMemo(
    () => new Set(allRankedResults.map((r) => r.item.id)),
    [allRankedResults],
  );

  const allSimilarItems = useMemo(
    () =>
      semanticItemIds
        .filter((id) => !exactResultIds.has(id))
        .map((id) => safeItems.find((i) => i.id === id))
        .filter(Boolean) as Item[],
    [semanticItemIds, exactResultIds, safeItems],
  );

  const similarItems = useMemo(
    () => allSimilarItems.slice(0, semanticLimit),
    [allSimilarItems, semanticLimit],
  );

  const handleSelect = useCallback(
    (item: Item) => {
      const exists = safeItems.some((i) => i.id === item.id);
      if (!exists) return;
      onOpenChange(false);
      if (item.type === "folder") {
        navigateToFolder(item.id);
      } else {
        setActiveFolderId(item.folderId ?? null);
        openWorkspaceItem(item.id);
      }
    },
    [safeItems, onOpenChange, navigateToFolder, setActiveFolderId, openWorkspaceItem],
  );

  const getFolderPathItems = useCallback(
    (item: Item): Item[] => {
      if (!item.folderId) return [];
      return getFolderPath(item.folderId, safeItems);
    },
    [safeItems],
  );

  function focusPaneItem(pane: "left" | "right", idx: number) {
    const ref = pane === "left" ? leftPaneRef : rightPaneRef;
    const elems = ref.current?.querySelectorAll<HTMLElement>("[data-item]");
    if (!elems?.length) return;
    elems[Math.max(0, Math.min(idx, elems.length - 1))]?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const focused = document.activeElement;
    const inInput = focused === inputRef.current;
    const inLeft = leftPaneRef.current?.contains(focused);
    const inRight = rightPaneRef.current?.contains(focused);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (inInput) {
        focusPaneItem("left", 0);
      } else if (inLeft) {
        const elems = Array.from(
          leftPaneRef.current?.querySelectorAll<HTMLElement>("[data-item]") ?? [],
        );
        focusPaneItem("left", elems.indexOf(focused as HTMLElement) + 1);
      } else if (inRight) {
        const elems = Array.from(
          rightPaneRef.current?.querySelectorAll<HTMLElement>("[data-item]") ?? [],
        );
        focusPaneItem("right", elems.indexOf(focused as HTMLElement) + 1);
      }
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (inLeft) {
        const elems = Array.from(
          leftPaneRef.current?.querySelectorAll<HTMLElement>("[data-item]") ?? [],
        );
        const idx = elems.indexOf(focused as HTMLElement);
        if (idx <= 0) inputRef.current?.focus();
        else focusPaneItem("left", idx - 1);
      } else if (inRight) {
        const elems = Array.from(
          rightPaneRef.current?.querySelectorAll<HTMLElement>("[data-item]") ?? [],
        );
        const idx = elems.indexOf(focused as HTMLElement);
        if (idx > 0) focusPaneItem("right", idx - 1);
      }
    }

    if (e.key === "Tab") {
      e.preventDefault();
      if (inLeft) focusPaneItem("right", 0);
      else if (inRight) focusPaneItem("left", 0);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[30%] translate-y-0 overflow-hidden p-0 gap-0 max-w-3xl flex flex-col"
        showCloseButton={false}
        onKeyDown={handleKeyDown}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Search workspace</DialogTitle>
          <DialogDescription>Search for items and folders</DialogDescription>
        </DialogHeader>

        {/* Search input */}
        <div className="flex items-center gap-3 border-b px-4 h-12 shrink-0">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items..."
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
        </div>

        {/* Two panes */}
        <div className="flex h-[360px] min-h-0">
          {/* Left: keyword matches */}
          <div
            ref={leftPaneRef}
            className="flex-1 flex flex-col overflow-hidden border-r"
          >
            <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-b shrink-0">
              Keyword Matches
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoadingWorkspace || !currentWorkspaceId ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Loading...
                </p>
              ) : !query.trim() ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Type to search...
                </p>
              ) : rankedResults.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No results for &ldquo;{query}&rdquo;
                </p>
              ) : (
                <>
                  {rankedResults.map(({ item, matchType, contentSnippet }) => (
                    <ResultItem
                      key={item.id}
                      item={item}
                      matchType={matchType}
                      contentSnippet={contentSnippet}
                      folderPathItems={getFolderPathItems(item)}
                      onSelect={handleSelect}
                    />
                  ))}
                  {allRankedResults.length > keywordLimit && (
                    <button
                      className="w-full px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-left"
                      onClick={() =>
                        setKeywordLimit((l) => l + KEYWORD_PAGE_SIZE)
                      }
                    >
                      Load{" "}
                      {Math.min(
                        KEYWORD_PAGE_SIZE,
                        allRankedResults.length - keywordLimit,
                      )}{" "}
                      more
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right: semantic matches */}
          <div
            ref={rightPaneRef}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-b shrink-0">
              Similar Content
            </div>
            <div className="flex-1 overflow-y-auto">
              {!query.trim() ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Type to search...
                </p>
              ) : semanticLoading && similarItems.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Searching...
                </p>
              ) : similarItems.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No similar content found.
                </p>
              ) : (
                <>
                  {similarItems.map((item) => (
                    <ResultItem
                      key={item.id}
                      item={item}
                      folderPathItems={getFolderPathItems(item)}
                      onSelect={handleSelect}
                    />
                  ))}
                  {allSimilarItems.length > semanticLimit && (
                    <button
                      className="w-full px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-left"
                      onClick={() =>
                        setSemanticLimit((l) => l + SEMANTIC_PAGE_SIZE)
                      }
                    >
                      Load{" "}
                      {Math.min(
                        SEMANTIC_PAGE_SIZE,
                        allSimilarItems.length - semanticLimit,
                      )}{" "}
                      more
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
