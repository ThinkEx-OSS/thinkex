import { useMemo } from "react";
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

export function useWorkspaceState(workspaceId: string | null) {
  const [rawRows, status] = useQuery(
    workspaceId ? queries.workspace.items({ workspaceId }) : null,
  );
  const rows = rawRows as unknown as
    | readonly WorkspaceItemQueryRow[]
    | undefined;

  const state = useMemo<Item[]>(() => {
    if (!rows) {
      return [];
    }

    return rows.map((row) => {
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
    if (status.type !== "error") {
      return null;
    }

    return new Error(status.error.message);
  }, [status]);

  return {
    state,
    isLoading: Boolean(workspaceId) && status.type === "unknown",
    error,
    version: 0,
    refetch: async () => {},
  };
}
