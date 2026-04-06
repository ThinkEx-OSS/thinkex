"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useUIStore } from "@/lib/stores/ui-store";

const DEBOUNCE_MS = 80;

/** Parsed URL state for workspace navigation */
interface UrlState {
  folder: string | null;
  items: string[];
}

/**
 * Syncs workspace navigation state between URL query params and the UI store.
 * Enables browser back/forward and shareable deep links.
 *
 * URL params:
 *   folder=<id>  — active folder filter
 *   items=<id>   — open item in the left pane (first id only today; comma-separated reserved for future split)
 */
export function useFolderUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeFolderId = useUIStore((state) => state.activeFolderId);
  const leftPaneItemId = useUIStore((state) => state.itemPanes.left);

  const setActiveFolderIdDirect = useUIStore((state) => state._setActiveFolderIdDirect);
  const setItemPanesFromUrl = useUIStore((state) => state._setItemPanesFromUrl);

  const isSyncingFromUrl = useRef(false);
  const lastPushedState = useRef<UrlState | undefined>(undefined);

  const parseUrlState = (): UrlState => {
    const folder = searchParams.get("folder") || null;
    const itemsParam = searchParams.get("items");
    const items = itemsParam
      ? itemsParam.split(",").filter(Boolean).slice(0, 1)
      : [];
    return { folder, items };
  };

  // URL → Store: on searchParams change (incl. back/forward)
  useEffect(() => {
    const url = parseUrlState();

    const folderChanged = url.folder !== activeFolderId;
    const storeItems = leftPaneItemId ? [leftPaneItemId] : [];
    const itemsChanged =
      url.items.length !== storeItems.length ||
      url.items.some((id, i) => id !== storeItems[i]);

    if (folderChanged || itemsChanged) {
      isSyncingFromUrl.current = true;

      if (folderChanged) {
        setActiveFolderIdDirect(url.folder);
      }
      if (itemsChanged) {
        setItemPanesFromUrl(url.items);
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
        items: leftPaneItemId ? [leftPaneItemId] : [],
      };
      return;
    }

    const next: UrlState = {
      folder: activeFolderId,
      items: leftPaneItemId ? [leftPaneItemId] : [],
    };

    const prev = lastPushedState.current;
    if (
      prev &&
      prev.folder === next.folder &&
      prev.items.length === next.items.length &&
      prev.items.every((id, i) => id === next.items[i])
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
      } else {
        params.delete("items");
      }

      params.delete("focus");
      params.delete("item");

      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, DEBOUNCE_MS);

    return () => clearTimeout(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFolderId, leftPaneItemId]);
}
