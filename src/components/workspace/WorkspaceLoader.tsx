"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ThreadLoadingSkeleton } from "@/components/chat/ThreadLoadingSkeleton";
import { cn } from "@/lib/utils";
import { THREAD_TOP_INSET } from "@/components/chat/thread-layout";
import { PANEL_DEFAULTS } from "@/lib/layout-constants";
import { useUIStore } from "@/lib/stores/ui-store";

/** Must stay in sync with `WorkspaceGrid` rowHeight + GRID_MARGIN + default 1-col h. */
const GRID_ROW_HEIGHT_PX = 25;
const GRID_MARGIN_Y_PX = 16;
/** Default single-column card height in grid rows for standard cards. */
const DEFAULT_CARD_GRID_ROWS = 4;
const SKELETON_CARD_HEIGHT_PX =
  DEFAULT_CARD_GRID_ROWS * GRID_ROW_HEIGHT_PX +
  (DEFAULT_CARD_GRID_ROWS - 1) * GRID_MARGIN_Y_PX;
/**
 * Full-shell skeleton: header bar + bento card grid + (when chat is open)
 * a chat-panel slot. Used by `ZeroProvider` while the session/Zero client
 * are bootstrapping. Reads the same chat-expanded state as `WorkspaceLayout`
 * so the canvas doesn't paint full-width and then snap when the real layout
 * mounts with chat open.
 */
export function WorkspaceLoader() {
  const isChatExpanded = useUIStore((s) => s.isChatExpanded);
  const isChatMaximized = useUIStore((s) => s.isChatMaximized);

  if (isChatMaximized) {
    return (
      <div className="flex min-h-dvh w-full">
        <ChatPanelSkeleton />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh w-full">
      <div
        className="flex flex-col"
        style={{ width: isChatExpanded ? `${100 - PANEL_DEFAULTS.CHAT}%` : "100%" }}
      >
        <WorkspaceHeaderSkeleton />
        <div className="flex-1 overflow-hidden">
          <WorkspaceCardsLoader />
        </div>
      </div>
      {isChatExpanded ? (
        <div style={{ width: `${PANEL_DEFAULTS.CHAT}%` }}>
          <ChatPanelSkeleton />
        </div>
      ) : null}
    </div>
  );
}

/**
 * In-shell loader for `view.kind === "loading"` inside `WorkspaceSection`.
 * Padding/gap mirror `WorkspaceContent` + `WorkspaceGrid`: outer `py-4`,
 * horizontal inset 16px (`px-4`, same as RGL `containerPadding` [16, 0]),
 * `gap-4` (= 16px) like `GRID_MARGIN` [16, 16]. Tile height matches RGL’s
 * pixel height for a default h=4 card (rowHeight×h + marginY×(h−1)). Ghost
 * tiles use a flat muted fill (not solid `Skeleton` blocks).
 */
export function WorkspaceCardsLoader() {
  return (
    <div className="w-full py-4">
      <div className="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            aria-hidden
            className={cn(
              "rounded-xl",
              "border border-border/25 bg-muted/15",
              "shadow-sm ring-1 ring-inset ring-foreground/[0.05]",
              "animate-pulse",
            )}
            style={{
              height: SKELETON_CARD_HEIGHT_PX,
              animationDelay: `${i * 80}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Placeholder for `ChatPanel` while the active workspace is being resolved.
 * Reserves the chat panel's slot so the workspace canvas doesn't paint
 * full-width and then suddenly shrink when the real chat panel mounts.
 * Reuses `ThreadLoadingSkeleton` for the body so the loading shape matches
 * what `ThreadBody` already shows mid-thread-switch.
 */
export function ChatPanelSkeleton() {
  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex items-center justify-end gap-2 px-4 py-3">
        <Skeleton className="h-7 w-7 rounded-md" />
        <Skeleton className="h-7 w-7 rounded-md" />
        <Skeleton className="h-7 w-7 rounded-md" />
      </div>
      <div
        className="h-full w-full flex-1 overflow-x-hidden overflow-y-auto px-3 sm:px-6"
        style={{ paddingTop: THREAD_TOP_INSET }}
      >
        <ThreadLoadingSkeleton />
      </div>
      <div className="px-3 pb-3 sm:px-6">
        <Skeleton className="mx-auto h-20 w-full max-w-[46rem] rounded-2xl" />
      </div>
    </div>
  );
}

/**
 * Placeholder for `WorkspaceHeader` while the active workspace is being
 * resolved. Mirrors the real header's shape: sidebar-toned bar, left chrome
 * (logo + sidebar toggle + breadcrumb pill), right action buttons.
 */
export function WorkspaceHeaderSkeleton() {
  return (
    <div className="relative z-20 bg-sidebar py-2">
      <div className="flex w-full items-center gap-3 px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Skeleton className="h-6 w-6 rounded-md" />
          <Skeleton className="h-6 w-6 rounded-md" />
          <Skeleton className="ml-1 h-4 w-40 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-7 rounded-md" />
          <Skeleton className="h-7 w-7 rounded-md" />
          <Skeleton className="h-7 w-16 rounded-md" />
        </div>
      </div>
    </div>
  );
}
