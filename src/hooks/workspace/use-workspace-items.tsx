"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Item } from "@/lib/workspace-state/types";
import { useCurrentWorkspaceId } from "@/contexts/WorkspaceContext";
import {
  useWorkspaceState,
  type WorkspaceStateStatus,
} from "@/hooks/workspace/use-workspace-state";

/**
 * Single shared subscription to the current workspace's items.
 *
 * Before this context, `useWorkspaceState(workspaceId)` was called from ~12
 * deep leaves (every chat tool, MarkdownText, the dropzone, sidebar card list,
 * etc.). Each one re-fanned the same Zero query and required the consumer to
 * be mounted under `ZeroProvider`. Now the subscription lives once in
 * `WorkspaceItemsProvider`; presentational consumers read plain data and don't
 * know Zero exists.
 */
interface WorkspaceItemsValue {
  items: Item[];
  status: WorkspaceStateStatus;
  error: Error | null;
}

const WorkspaceItemsContext = createContext<WorkspaceItemsValue | null>(null);

export function WorkspaceItemsProvider({ children }: { children: ReactNode }) {
  const currentWorkspaceId = useCurrentWorkspaceId();
  const { state, status, error } = useWorkspaceState(currentWorkspaceId);

  const value = useMemo<WorkspaceItemsValue>(
    () => ({ items: state, status, error }),
    [state, status, error],
  );

  return (
    <WorkspaceItemsContext.Provider value={value}>
      {children}
    </WorkspaceItemsContext.Provider>
  );
}

const EMPTY: WorkspaceItemsValue = {
  items: [],
  status: "idle",
  error: null,
};

/**
 * Read the current workspace's items. Returns an empty array outside the
 * provider (keeps tests and isolated stories from crashing).
 */
export function useWorkspaceItems(): Item[] {
  return (useContext(WorkspaceItemsContext) ?? EMPTY).items;
}

export function useWorkspaceItemsLoading(): boolean {
  return (useContext(WorkspaceItemsContext) ?? EMPTY).status === "loading";
}

/** Full status for the gating layer (`useWorkspaceView`). */
export function useWorkspaceItemsStatus() {
  return useContext(WorkspaceItemsContext) ?? EMPTY;
}
