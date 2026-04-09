"use client";

import { useCallback, useEffect, useRef } from "react";
import { useDebouncer } from "@tanstack/react-pacer/debouncer";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useUIStore } from "@/lib/stores/ui-store";

const DEBOUNCE_MS = 80;

/** Parsed URL state for workspace navigation */
interface UrlState {
  folder: string | null;
  items: string[];
}

function openItemsToUrlList(openItems: {
  primary: string | null;
  secondary: string | null;
}): string[] {
  const out: string[] = [];
  if (openItems.primary) out.push(openItems.primary);
  if (openItems.secondary) out.push(openItems.secondary);
  return out;
}

/**
 * Syncs workspace navigation state between URL query params and the UI store.
 * Enables browser back/forward and shareable deep links.
 *
 * URL params:
 *   folder=<id>    — active folder filter
 *   items=id[,id2] — open item(s): first = primary, second = secondary (split)
 */
export function useFolderUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeFolderId = useUIStore((state) => state.activeFolderId);
  const openItems = useUIStore((state) => state.openItems);

  const setActiveFolderIdDirect = useUIStore(
    (state) => state._setActiveFolderIdDirect,
  );
  const setOpenItemsFromUrl = useUIStore((state) => state._setOpenItemsFromUrl);

  const isSyncingFromUrl = useRef(false);
  const lastPushedState = useRef<UrlState | undefined>(undefined);
  const pushUrlState = useCallback(
    (next: UrlState) => {
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
    },
    [pathname, router, searchParams],
  );
  const pushUrlDebouncer = useDebouncer(pushUrlState, {
    wait: DEBOUNCE_MS,
  });

  const parseUrlState = (): UrlState => {
    const folder = searchParams.get("folder") || null;
    const itemsParam = searchParams.get("items");
    const items = itemsParam
      ? itemsParam.split(",").filter(Boolean).slice(0, 2)
      : [];
    return { folder, items };
  };

  // URL → Store: on searchParams change (incl. back/forward)
  useEffect(() => {
    const url = parseUrlState();

    const folderChanged = url.folder !== activeFolderId;
    const storeItems = openItemsToUrlList(openItems);
    const itemsChanged =
      url.items.length !== storeItems.length ||
      url.items.some((id, i) => id !== storeItems[i]);

    if (folderChanged || itemsChanged) {
      isSyncingFromUrl.current = true;

      if (folderChanged) {
        setActiveFolderIdDirect(url.folder);
      }
      if (itemsChanged) {
        setOpenItemsFromUrl(url.items);
      }

      queueMicrotask(() => {
        isSyncingFromUrl.current = false;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Store → URL: on store change, debounced
  useEffect(() => {
    const storeItems = openItemsToUrlList(openItems);

    if (isSyncingFromUrl.current) {
      pushUrlDebouncer.cancel();
      lastPushedState.current = {
        folder: activeFolderId,
        items: storeItems,
      };
      return;
    }

    const next: UrlState = {
      folder: activeFolderId,
      items: storeItems,
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

    pushUrlDebouncer.maybeExecute(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeFolderId,
    openItems.primary,
    openItems.secondary,
    pushUrlDebouncer,
  ]);
}
