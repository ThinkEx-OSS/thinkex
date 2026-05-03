import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@rocicorp/zero/react";
import { rehydrateWorkspaceItem } from "@/lib/workspace/workspace-item-model";
import type { WorkspaceItemContentProjection } from "@/lib/workspace/workspace-item-model-types";
import type { Item } from "@/lib/workspace-state/types";
import { queries } from "@/lib/zero/queries";
import type {
  WorkspaceItemContentRow,
  WorkspaceItemsRow,
} from "@/lib/zero/zero-schema.gen";

type WorkspaceItemQueryRow = WorkspaceItemsRow & {
  workspaceItemContent?:
    | readonly WorkspaceItemContentRow[]
    | WorkspaceItemContentRow;
};

function compareWorkspaceItemQueryRows(
  a: WorkspaceItemQueryRow,
  b: WorkspaceItemQueryRow,
): number {
  const sortOrderDiff =
    (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
    (b.sortOrder ?? Number.MAX_SAFE_INTEGER);

  if (sortOrderDiff !== 0) {
    return sortOrderDiff;
  }

  const createdAtDiff =
    (a.createdAt ?? Number.MAX_SAFE_INTEGER) -
    (b.createdAt ?? Number.MAX_SAFE_INTEGER);

  if (createdAtDiff !== 0) {
    return createdAtDiff;
  }

  return a.itemId.localeCompare(b.itemId);
}

const LOADING_TIMEOUT_MS = 8_000;

export type WorkspaceStateStatus =
  | "idle" // no workspaceId yet
  | "loading" // Zero hasn't returned a result
  | "ready" // results in hand (possibly empty)
  | "error" // Zero reported an error
  | "timeout"; // still in 'unknown' after LOADING_TIMEOUT_MS

export interface UseWorkspaceStateResult {
  state: Item[];
  status: WorkspaceStateStatus;
  isLoading: boolean;
  isReady: boolean;
  error: Error | null;
}

export function useWorkspaceState(
  workspaceId: string | null,
): UseWorkspaceStateResult {
  const [rawRows, queryStatus] = useQuery(
    workspaceId ? queries.workspace.items({ workspaceId }) : null,
  );
  const rows = rawRows as unknown as
    | readonly WorkspaceItemQueryRow[]
    | undefined;

  const [timedOut, setTimedOut] = useState(false);

  // Reset the timer whenever workspace or query status changes.
  useEffect(() => {
    setTimedOut(false);
    if (!workspaceId) return;
    if (queryStatus.type !== "unknown") return;

    const timer = setTimeout(() => setTimedOut(true), LOADING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [workspaceId, queryStatus.type]);

  const status = useMemo<WorkspaceStateStatus>(() => {
    if (!workspaceId) return "idle";
    if (queryStatus.type === "error") return "error";
    if (queryStatus.type === "unknown") return timedOut ? "timeout" : "loading";
    return "ready";
  }, [workspaceId, queryStatus.type, timedOut]);

  const state = useMemo<Item[]>(() => {
    if (!rows) {
      return [];
    }

    return [...rows].sort(compareWorkspaceItemQueryRows).map((row) => {
      const contentRow = Array.isArray(row.workspaceItemContent)
        ? (row.workspaceItemContent[0] ?? null)
        : (row.workspaceItemContent ?? null);

      return rehydrateWorkspaceItem({
        shell: {
          itemId: row.itemId,
          type: row.type as Item["type"],
          name: row.name,
          subtitle: row.subtitle,
          color: (row.color as Item["color"]) ?? null,
          folderId: row.folderId ?? null,
          sortOrder: row.sortOrder ?? null,
          layout: (row.layout as Item["layout"]) ?? null,
          lastModified: row.lastModified ?? null,
          ocrStatus: row.ocrStatus ?? null,
          processingStatus: row.processingStatus ?? null,
        },
        content: contentRow
          ? {
              textContent: contentRow.textContent ?? null,
              structuredData:
                (contentRow.structuredData as Record<string, unknown>) ?? null,
              assetData:
                (contentRow.assetData as Record<string, unknown>) ?? null,
              embedData:
                (contentRow.embedData as Record<string, unknown>) ?? null,
              sourceData:
                (contentRow.sourceData as WorkspaceItemContentProjection["sourceData"]) ??
                null,
            }
          : null,
        extracted: null,
      });
    });
  }, [rows]);

  const error = useMemo(() => {
    if (queryStatus.type === "error") {
      return new Error(queryStatus.error.message);
    }
    if (status === "timeout") {
      return new Error("Workspace data timed out");
    }
    return null;
  }, [queryStatus, status]);

  return {
    state,
    status,
    isLoading: status === "loading",
    isReady: status === "ready",
    error,
  };
}
