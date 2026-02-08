"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useUIStore } from "@/lib/stores/ui-store";

/**
 * Hook that syncs workspace navigation state between URL query params and the UI store.
 * This enables browser-native back/forward navigation for folders AND open items.
 *
 * Query params:
 *   ?folder=<id>  — active folder
 *   ?item=<id>    — open/maximized item panel (note, PDF, etc.)
 *
 * Usage: Call once in the DashboardView component.
 *
 * - On mount / URL change: reads params and sets store state
 * - On store change: pushes new URL (creates browser history entry)
 * - On browser back/forward (popstate): URL changes trigger the first path above
 */
export function useFolderUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Folder state
  const activeFolderId = useUIStore((state) => state.activeFolderId);
  const setActiveFolderIdDirect = useUIStore((state) => state._setActiveFolderIdDirect);

  // Panel state — track the first open panel (maximized item)
  const openPanelId = useUIStore((state) => state.openPanelIds[0] ?? null);
  const openPanelDirect = useUIStore((state) => state._openPanelDirect);
  const closePanelDirect = useUIStore((state) => state._closePanelDirect);

  // Track whether we're currently syncing from URL → store to avoid circular updates
  const isSyncingFromUrl = useRef(false);
  // Track the last state we pushed to the URL to avoid duplicate pushes
  const lastPushedState = useRef<{ folder: string | null; item: string | null } | undefined>(undefined);

  // Sync URL → Store: When the URL changes (including browser back/forward),
  // update the store to match
  useEffect(() => {
    const folderFromUrl = searchParams.get("folder") || null;
    const itemFromUrl = searchParams.get("item") || null;

    const folderChanged = folderFromUrl !== activeFolderId;
    const itemChanged = itemFromUrl !== openPanelId;

    if (folderChanged || itemChanged) {
      isSyncingFromUrl.current = true;

      if (folderChanged) {
        setActiveFolderIdDirect(folderFromUrl);
      }
      if (itemChanged) {
        if (itemFromUrl) {
          openPanelDirect(itemFromUrl);
        } else {
          closePanelDirect();
        }
      }

      // Reset sync flag after microtask to allow the store updates to propagate
      queueMicrotask(() => {
        isSyncingFromUrl.current = false;
      });
    }
    // We intentionally only depend on searchParams to react to URL changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Sync Store → URL: When activeFolderId or openPanelId changes in the store
  // (from user clicking a folder, opening a note, etc.), push a new URL
  useEffect(() => {
    // Skip if this change came from a URL sync (avoid circular loop)
    if (isSyncingFromUrl.current) {
      // Still update lastPushedState so it doesn't go stale — otherwise
      // re-clicking the same folder/item after browser-back won't push a new URL
      // because the check below would see the old (pre-back) state as matching.
      lastPushedState.current = { folder: activeFolderId, item: openPanelId };
      return;
    }

    // Skip if we already pushed this exact state (avoid duplicate history entries)
    if (
      lastPushedState.current &&
      lastPushedState.current.folder === activeFolderId &&
      lastPushedState.current.item === openPanelId
    ) {
      return;
    }

    lastPushedState.current = { folder: activeFolderId, item: openPanelId };

    // Build the new URL
    const params = new URLSearchParams(searchParams.toString());
    if (activeFolderId) {
      params.set("folder", activeFolderId);
    } else {
      params.delete("folder");
    }
    if (openPanelId) {
      params.set("item", openPanelId);
    } else {
      params.delete("item");
    }

    const paramString = params.toString();
    const newUrl = paramString ? `${pathname}?${paramString}` : pathname;

    // Push to create a browser history entry (enables back/forward)
    router.push(newUrl, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFolderId, openPanelId]);

  // On initial mount, sync URL → store if there are params
  // (This handles deep links / page refresh)
  useEffect(() => {
    const folderFromUrl = searchParams.get("folder") || null;
    const itemFromUrl = searchParams.get("item") || null;

    if (folderFromUrl && folderFromUrl !== activeFolderId) {
      setActiveFolderIdDirect(folderFromUrl);
    }
    if (itemFromUrl && itemFromUrl !== openPanelId) {
      openPanelDirect(itemFromUrl);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
