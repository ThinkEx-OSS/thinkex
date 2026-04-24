"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

const VERSION_ENDPOINT = "/api/version";
const DEFAULT_INTERVAL_MS = 60_000;
const DISMISSED_STORAGE_KEY = "thinkex_version_dismissed";

async function fetchVersion(): Promise<string> {
  const res = await fetch(VERSION_ENDPOINT, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`version check failed: ${res.status}`);
  }
  return (await res.text()).trim();
}

function readDismissed(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(DISMISSED_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(version: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DISMISSED_STORAGE_KEY, version);
  } catch {
    // localStorage full / unavailable — ignore
  }
}

export interface UseVersionCheckerResult {
  hasUpdate: boolean;
  currentVersion: string | null;
  initialVersion: string | null;
  dismiss: () => void;
}

export function useVersionChecker(
  intervalMs: number = DEFAULT_INTERVAL_MS,
): UseVersionCheckerResult {
  const [initialVersion, setInitialVersion] = useState<string | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  useEffect(() => {
    setDismissedVersion(readDismissed());
  }, []);

  const { data: currentVersion } = useQuery({
    queryKey: ["app-version"],
    queryFn: fetchVersion,
    refetchInterval: intervalMs,
    refetchIntervalInBackground: false,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (currentVersion && initialVersion === null) {
      setInitialVersion(currentVersion);
    }
  }, [currentVersion, initialVersion]);

  const dismiss = useCallback(() => {
    if (!currentVersion) return;
    writeDismissed(currentVersion);
    setDismissedVersion(currentVersion);
  }, [currentVersion]);

  const hasUpdate =
    !!currentVersion &&
    !!initialVersion &&
    currentVersion !== initialVersion &&
    currentVersion !== dismissedVersion &&
    currentVersion !== "dev" &&
    initialVersion !== "dev";

  return {
    hasUpdate,
    currentVersion: currentVersion ?? null,
    initialVersion,
    dismiss,
  };
}
