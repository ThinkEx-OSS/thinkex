"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { useTheme } from "next-themes";

import { Skeleton } from "@/components/ui/skeleton";
import { ThreadLoadingSkeleton } from "@/components/chat/ThreadLoadingSkeleton";

function useBrandLottieSrc() {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "light" ? "/thinkexlight.lottie" : "/logo.lottie";
}

/**
 * Full-viewport loader for the **pre-shell** phases — used while there's no
 * workspace chrome on screen yet (no session, Zero client not ready).
 */
export function WorkspaceLoader() {
  const src = useBrandLottieSrc();
  return (
    <div className="grid min-h-dvh w-full flex-1 place-items-center">
      <DotLottieReact
        src={src}
        loop
        autoplay
        mode="bounce"
        className="h-16 w-16 shrink-0"
      />
    </div>
  );
}

/**
 * In-shell loader for `view.kind === "loading"` inside `WorkspaceSection`.
 * Bento-style placeholder grid that mirrors the freeform card layout —
 * 1/2/3/4 columns at sm/md/lg with mixed col/row spans.
 */
const BENTO_TILES: ReadonlyArray<{ col: string; row: string }> = [
  { col: "lg:col-span-2", row: "row-span-2" },
  { col: "lg:col-span-1", row: "row-span-1" },
  { col: "lg:col-span-1", row: "row-span-3" },
  { col: "lg:col-span-1", row: "row-span-2" },
  { col: "lg:col-span-2", row: "row-span-1" },
  { col: "lg:col-span-1", row: "row-span-2" },
  { col: "lg:col-span-2", row: "row-span-2" },
  { col: "lg:col-span-1", row: "row-span-1" },
  { col: "lg:col-span-1", row: "row-span-2" },
  { col: "lg:col-span-2", row: "row-span-1" },
];

export function WorkspaceCardsLoader() {
  return (
    <div className="size-full px-4 pt-6 sm:px-6">
      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
        style={{ gridAutoRows: "5rem" }}
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
