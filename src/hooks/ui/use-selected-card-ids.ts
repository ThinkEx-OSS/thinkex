"use client";

import { useMemo } from "react";
import { useUIStore, selectSelectedCardIdsArray } from "@/lib/stores/ui-store";
import { useShallow } from "zustand/react/shallow";

/**
 * Shared hook for card selection state.
 * Returns both the sorted array (for length, includes) and Set (for .has()).
 * Memoized to prevent unnecessary re-renders.
 */
export function useSelectedCardIds() {
  const selectedCardIdsArray = useUIStore(useShallow(selectSelectedCardIdsArray));
  const selectedCardIds = useMemo(
    () => new Set(selectedCardIdsArray),
    [selectedCardIdsArray]
  );
  return { selectedCardIdsArray, selectedCardIds };
}
