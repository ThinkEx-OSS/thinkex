"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ThreadLoadingSkeleton } from "@/components/chat/ThreadLoadingSkeleton";
import { PANEL_DEFAULTS } from "@/lib/layout-constants";
import { useUIStore } from "@/lib/stores/ui-store";

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
 * Bento-style placeholder grid that mirrors the freeform card layout —
 * 1/2/3/4 columns at sm/md/lg with mixed col/row spans.
 */
const BENTO_TILES: ReadonlyArray<{ col: string; row: string }> = [
  { col: "lg:col-span-2", row: "row-span-3" },
  { col: "lg:col-span-1", row: "row-span-2" },
  { col: "lg:col-span-1", row: "row-span-3" },
  { col: "lg:col-span-1", row: "row-span-2" },
  { col: "lg:col-span-2", row: "row-span-2" },
  { col: "lg:col-span-1", row: "row-span-3" },
  { col: "lg:col-span-2", row: "row-span-2" },
  { col: "lg:col-span-1", row: "row-span-2" },
  { col: "lg:col-span-1", row: "row-span-3" },
  { col: "lg:col-span-2", row: "row-span-2" },
];

export function WorkspaceCardsLoader() {
  return (
    <div className="size-full px-4 pt-6 sm:px-6">
      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
        style={{ gridAutoRows: "3.25rem" }}
      >
        {BENTO_TILES.map((tile, i) => (
          <Skeleton
            key={i}
            className={`${tile.col} ${tile.row} rounded-xl`}
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
      <div className="flex-1 overflow-hidden">
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
