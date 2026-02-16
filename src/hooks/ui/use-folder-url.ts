"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useUIStore } from "@/lib/stores/ui-store";

const DEBOUNCE_MS = 80;

/** Parsed URL state for workspace navigation */
interface UrlState {
  folder: string | null;
  items: string[];
  focus: string | null;
}

/**
 * Syncs workspace navigation state between URL query params and the UI store.
 * Enables browser back/forward and shareable deep links.
 *
 * URL params:
 *   folder=<id>   — active folder filter
 *   items=<ids>  — open panels: "id" or "id1,id2" (split view)
 *   focus=<id>   — maximized (focused) panel; only valid when single panel
 *   item=<id>    — legacy, same as items=<id>
 */
export function useFolderUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeFolderId = useUIStore((state) => state.activeFolderId);
  const openPanelIds = useUIStore((state) => state.openPanelIds);
  const maximizedItemId = useUIStore((state) => state.maximizedItemId);

  const setActiveFolderIdDirect = useUIStore((state) => state._setActiveFolderIdDirect);
  const setPanelsFromUrl = useUIStore((state) => state._setPanelsFromUrl);

  const isSyncingFromUrl = useRef(false);
  const lastPushedState = useRef<UrlState | undefined>(undefined);

  const parseUrlState = (): UrlState => {
    const folder = searchParams.get("folder") || null;
    const itemsParam = searchParams.get("items");
    const legacyItem = searchParams.get("item");
    const items = itemsParam
      ? itemsParam.split(",").filter(Boolean).slice(0, 2)
      : legacyItem
        ? [legacyItem]
        : [];
    const focusParam = searchParams.get("focus");
    const focus =
      focusParam && items.length === 1 && items[0] === focusParam
        ? focusParam
        : null;
    return { folder, items, focus };
  };

  // URL → Store: on searchParams change (incl. back/forward)
  useEffect(() => {
    const url = parseUrlState();

    const folderChanged = url.folder !== activeFolderId;
    const itemsChanged =
      url.items.length !== openPanelIds.length ||
      url.items.some((id, i) => id !== openPanelIds[i]);
    const focusChanged = url.focus !== maximizedItemId;

    if (folderChanged || itemsChanged || focusChanged) {
      isSyncingFromUrl.current = true;

      if (folderChanged) {
        setActiveFolderIdDirect(url.folder);
      }
      if (itemsChanged || focusChanged) {
        setPanelsFromUrl(url.items, url.focus);
      }

      queueMicrotask(() => {
        isSyncingFromUrl.current = false;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Store → URL: on store change, debounced
  useEffect(() => {
    if (isSyncingFromUrl.current) {
      lastPushedState.current = {
        folder: activeFolderId,
        items: [...openPanelIds],
        focus: maximizedItemId,
      };
      return;
    }

    const next: UrlState = {
      folder: activeFolderId,
      items: [...openPanelIds],
      focus:
        maximizedItemId && openPanelIds.length === 1 && openPanelIds[0] === maximizedItemId
          ? maximizedItemId
          : null,
    };

    const prev = lastPushedState.current;
    if (
      prev &&
      prev.folder === next.folder &&
      prev.items.length === next.items.length &&
      prev.items.every((id, i) => id === next.items[i]) &&
      prev.focus === next.focus
    ) {
      return;
    }

    const tid = setTimeout(() => {
      lastPushedState.current = next;

      const params = new URLSearchParams(searchParams.toString());

      if (next.folder) params.set("folder", next.folder);
      else params.delete("folder");

      if (next.items.length > 0) {
        params.set("items", next.items.join(","));
        params.delete("item");
      } else {
        params.delete("items");
        params.delete("item");
      }

      if (next.focus) params.set("focus", next.focus);
      else params.delete("focus");

      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, DEBOUNCE_MS);

    return () => clearTimeout(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFolderId, openPanelIds, maximizedItemId]);

}
