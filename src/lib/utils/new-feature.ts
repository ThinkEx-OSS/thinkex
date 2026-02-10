"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_PREFIX = "thinkex_feature_seen_";

interface NewFeatureOptions {
  /** Unique key identifying this feature */
  featureKey: string;
  /** How long (in ms) the badge stays visible after first seen. Default: 14 days */
  ttl?: number;
  /** If provided, the badge won't show before this date */
  startDate?: Date;
  /** If provided, the badge won't show after this date (regardless of TTL) */
  endDate?: Date;
}

interface NewFeatureState {
  /** Whether the "new" badge should be visible */
  isNew: boolean;
  /** Call this to permanently dismiss the badge for this user */
  dismiss: () => void;
}

const DEFAULT_TTL = 14 * 24 * 60 * 60 * 1000; // 14 days

function getStorageKey(featureKey: string) {
  return `${STORAGE_PREFIX}${featureKey}`;
}

function isFeatureDismissed(featureKey: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(getStorageKey(featureKey));
    if (!raw) return false;
    const data = JSON.parse(raw) as { dismissedAt: number };
    return !!data.dismissedAt;
  } catch {
    return false;
  }
}

function dismissFeature(featureKey: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      getStorageKey(featureKey),
      JSON.stringify({ dismissedAt: Date.now() }),
    );
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function isWithinWindow(
  ttl: number,
  startDate?: Date,
  endDate?: Date,
): boolean {
  const now = Date.now();
  if (startDate && now < startDate.getTime()) return false;
  if (endDate && now > endDate.getTime()) return false;

  // If there's a startDate, check TTL from startDate; otherwise always in window
  if (startDate) {
    return now - startDate.getTime() < ttl;
  }
  return true;
}

/**
 * Hook that tracks whether a feature should show a "new" badge.
 *
 * Uses localStorage so the badge is per-device. Once dismissed (either
 * manually or after the TTL / endDate expires), it won't reappear.
 *
 * @example
 * const { isNew, dismiss } = useNewFeature({ featureKey: "audio-upload", ttl: 14 * 24 * 60 * 60 * 1000 });
 */
export function useNewFeature({
  featureKey,
  ttl = DEFAULT_TTL,
  startDate,
  endDate,
}: NewFeatureOptions): NewFeatureState {
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    if (isFeatureDismissed(featureKey)) {
      setIsNew(false);
      return;
    }
    const inWindow = isWithinWindow(ttl, startDate, endDate);
    setIsNew(inWindow);
  }, [featureKey, ttl, startDate, endDate]);

  const dismiss = useCallback(() => {
    dismissFeature(featureKey);
    setIsNew(false);
  }, [featureKey]);

  return { isNew, dismiss };
}

/** Imperative helper — useful outside of React components */
export const newFeatureUtils = {
  isDismissed: isFeatureDismissed,
  dismiss: dismissFeature,
};
