"use client";

import { useMemo } from "react";
import { useSession } from "@/lib/auth-client";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useWorkspaceItemsStatus } from "@/hooks/workspace/use-workspace-items";
import { useZeroReset, useZeroStatus } from "@/lib/zero/provider";
import type { Item, WorkspaceWithState } from "@/lib/workspace-state/types";

/**
 * Single source of truth for the workspace shell view state. Replaces a tangle
 * of `loadingWorkspaces`/`loadingCurrentWorkspace`/`isLoadingWorkspace` flags
 * that produced contradictory branches in `WorkspaceSection`.
 */
export type WorkspaceView =
  | { kind: "loading" }
  | { kind: "unauthenticated" }
  | { kind: "denied" }
  | { kind: "error"; message: string; retry: () => void }
  | { kind: "ready"; items: Item[]; workspace: WorkspaceWithState };

export function useWorkspaceView(): WorkspaceView {
  const { data: session, isPending: sessionPending } = useSession();
  const { isReady: zeroReady } = useZeroStatus();
  const reset = useZeroReset();
  const { currentWorkspace, loadingCurrentWorkspace, currentSlug } =
    useWorkspaceContext();
  const { items: state, status, error } = useWorkspaceItemsStatus();

  return useMemo<WorkspaceView>(() => {
    if (sessionPending || !zeroReady) return { kind: "loading" };

    if (currentSlug && !currentWorkspace) {
      if (loadingCurrentWorkspace) return { kind: "loading" };
      if (!session || session.user?.isAnonymous) {
        return { kind: "unauthenticated" };
      }
      return { kind: "denied" };
    }
    if (!currentWorkspace) return { kind: "loading" };

    if (status === "error" || status === "timeout") {
      return {
        kind: "error",
        retry: reset,
        message:
          error?.message ?? "Workspace data could not be loaded.",
      };
    }
    if (status !== "ready") return { kind: "loading" };

    return { kind: "ready", items: state, workspace: currentWorkspace };
  }, [
    sessionPending,
    zeroReady,
    currentSlug,
    currentWorkspace,
    loadingCurrentWorkspace,
    session?.user?.isAnonymous,
    status,
    state,
    error,
    reset,
  ]);
}
