"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import { useEffect, useMemo, useRef } from "react";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useUIStore } from "@/lib/stores/ui-store";
import { CheckIcon, Loader2, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

import ShinyText from "@/components/ShinyText";

type SelectCardsArgs = {
  cardIds?: string[];
  cardTitles?: string[];
};

type SelectCardsResult = {
  success: boolean;
  message: string;
  addedCount?: number;
  invalidIds?: string[];
};

/**
 * Frontend UI + effect layer for the selectCards tool.
 * When the tool runs, it selects the requested cards via the UI store,
 * which automatically adds them to the assistant's context drawer.
 */
export const SelectCardsToolUI = makeAssistantToolUI<SelectCardsArgs, SelectCardsResult>({
  toolName: "selectCards",
  render: ({ args, status }) => {
    const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
    const { state } = useWorkspaceState(workspaceId);
    const selectMultipleCards = useUIStore((ui) => ui.selectMultipleCards);
    const currentSelectedIds = useUIStore((ui) => ui.selectedCardIds);

    const hasSelectedRef = useRef(false);

    const availableIds = useMemo(() => {
      return new Set((state?.items || []).map((item) => item.id));
    }, [state?.items]);

    useEffect(() => {
      if (hasSelectedRef.current) return;
      if ((!args?.cardIds || args.cardIds.length === 0) && (!args?.cardTitles || args.cardTitles.length === 0)) return;

      // Only execute when the tool is actively running (first execution)
      // Don't execute on "complete" status to avoid re-selection on refresh
      if (status.type === "running") {
        let idsToSelect: string[] = [];

        // Handle IDs if present
        if (args.cardIds && args.cardIds.length > 0) {
          const validIds = args.cardIds.filter((id) => availableIds.has(id));
          idsToSelect = [...idsToSelect, ...validIds];
        }

        // Handle Titles if present - resolve to IDs
        if (args.cardTitles && args.cardTitles.length > 0 && state?.items) {
          args.cardTitles.forEach(title => {
            const searchTitle = title.toLowerCase().trim();
            // 1. Exact match
            let match = state.items.find(item => item.name.toLowerCase().trim() === searchTitle);
            // 2. Contains match
            if (!match) {
              match = state.items.find(item => item.name.toLowerCase().includes(searchTitle));
            }

            if (match && availableIds.has(match.id)) {
              if (!idsToSelect.includes(match.id)) {
                idsToSelect.push(match.id);
              }
            }
          });
        }

        // Only update selection if we have at least one valid card
        if (idsToSelect.length > 0) {
          // Merge with existing selection instead of replacing
          // This preserves both single and multiple existing selections (whether 1 card or many)
          const existingIdsArray = Array.from(currentSelectedIds);
          const mergedIds = Array.from(new Set([...existingIdsArray, ...idsToSelect]));
          selectMultipleCards(mergedIds);
        }
        hasSelectedRef.current = true;
      }
    }, [args?.cardIds, args?.cardTitles, availableIds, selectMultipleCards, status.type, currentSelectedIds, state?.items]);

    // Get selected cards with their names
    const selectedCards = useMemo(() => {
      if (!state?.items) return [];

      const idsFromArgs = args?.cardIds || [];
      const titlesFromArgs = args?.cardTitles || [];

      if (idsFromArgs.length === 0 && titlesFromArgs.length === 0) return [];

      const resolvedIds = new Set<string>();

      // Resolve IDs
      idsFromArgs.forEach(id => {
        if (availableIds.has(id)) resolvedIds.add(id);
      });

      // Resolve Titles
      titlesFromArgs.forEach(title => {
        const searchTitle = title.toLowerCase().trim();
        let match = state.items.find(item => item.name.toLowerCase().trim() === searchTitle);
        if (!match) {
          match = state.items.find(item => item.name.toLowerCase().includes(searchTitle));
        }
        if (match && availableIds.has(match.id)) {
          resolvedIds.add(match.id);
        }
      });

      return Array.from(resolvedIds)
        .map((id) => state.items.find((item) => item.id === id))
        .filter((item) => item !== undefined) as any[]; // Type assertion needed for strict mode
    }, [args?.cardIds, args?.cardTitles, state?.items, availableIds]);

    const validCount = selectedCards.length;
    // We only track invalid IDs for now, hard to track invalid titles effectively in this UI
    const invalidIds = args?.cardIds?.filter((id) => !availableIds.has(id)) || [];



    // Loading state
    if (status.type === "running") {
      return (
        <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border bg-card/50 text-card-foreground shadow-sm">
          <div className="flex items-center justify-between gap-2 bg-muted/20 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                <Loader2 className="size-4 animate-spin" />
              </div>
              <div className="flex flex-col">
                <ShinyText
                  text="Selecting Cards"
                  disabled={false}
                  speed={1.5}
                  className="text-sm font-semibold"
                />
                <span className="text-xs text-muted-foreground">Adding to context...</span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Success state with receipt
    if (status.type === "complete" && validCount > 0) {
      return (
        <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border bg-card/50 text-card-foreground shadow-sm">
          <div className={cn(
            "flex items-center justify-between gap-2 bg-muted/20 px-4 py-3",
            "border-b"
          )}>
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-green-500/10 text-green-600">
                <CheckIcon className="size-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">
                  {validCount} Card{validCount === 1 ? "" : "s"} Selected
                </span>
                <span className="text-xs text-muted-foreground">
                  Added to context drawer
                </span>
              </div>
            </div>

          </div>

          <div className="flex flex-col gap-2 p-4">
            <div className="flex flex-col gap-1.5">
              {selectedCards.map((card) => (
                <div
                  key={card.id}
                  className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2"
                >
                  <FileText className="size-4 text-muted-foreground" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-sm font-medium truncate">{card.name}</span>
                    {card.subtitle && (
                      <span className="text-xs text-muted-foreground truncate">{card.subtitle}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {invalidIds.length > 0 && (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  {invalidIds.length} invalid ID{invalidIds.length === 1 ? "" : "s"} skipped: {invalidIds.slice(0, 3).join(", ")}
                  {invalidIds.length > 3 && ` +${invalidIds.length - 3} more`}
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

    // No cards found state
    if (status.type === "complete" && validCount === 0) {
      return (
        <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border bg-card/50 text-card-foreground shadow-sm">
          <div className="flex items-center justify-between gap-2 bg-muted/20 px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                <X className="size-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">No Cards Found</span>
                <span className="text-xs text-muted-foreground">No matching card IDs</span>
              </div>
            </div>
          </div>
          {invalidIds.length > 0 && (
            <div className="p-4">
              <p className="text-xs text-muted-foreground mb-2">Invalid IDs:</p>
              <div className="flex flex-wrap gap-1">
                {invalidIds.map((id) => (
                  <span
                    key={id}
                    className="rounded-md border border-border bg-muted/50 px-2 py-1 text-xs font-mono"
                  >
                    {id.substring(0, 8)}...
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Error state
    if (status.type === "incomplete" && status.reason === "error") {
      return (
        <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border border-red-200 bg-red-50/50 text-card-foreground shadow-sm dark:border-red-800 dark:bg-red-950/30">
          <div className="flex items-center justify-between gap-2 bg-red-100/50 px-4 py-3 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-red-500/10 text-red-600">
                <X className="size-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-red-800 dark:text-red-200">
                  Failed to Select Cards
                </span>
                <span className="text-xs text-red-700 dark:text-red-300">
                  An error occurred
                </span>
              </div>
            </div>
          </div>
          {args?.cardIds && args.cardIds.length > 0 && (
            <div className="p-4">
              <p className="text-xs text-red-700 dark:text-red-300 mb-2">Requested IDs:</p>
              <div className="flex flex-wrap gap-1">
                {args.cardIds.map((id) => (
                  <span
                    key={id}
                    className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-mono dark:border-red-800 dark:bg-red-900/30"
                  >
                    {id.substring(0, 8)}...
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Default fallback - hide UI
    return null;
  },
});

