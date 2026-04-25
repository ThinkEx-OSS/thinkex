import { useMemo } from "react";

import type { Item } from "@/lib/workspace-state/types";
import { formatWorkspaceContext } from "@/lib/utils/format-workspace-context";

/**
 * Computes the workspace-level system prompt (workspace name + items overview)
 * that should travel with every chat turn for the given workspace. Returns an
 * empty string when no workspace is active.
 *
 * The legacy implementation registered this with the AUI runtime via
 * `useChatAssistantContext`; the new chat surface forwards the returned string
 * to the AI SDK transport as `body.system` so the server can prepend it.
 */
export function useWorkspaceContextProvider(
  workspaceId: string | null,
  items: Item[],
  workspaceName?: string,
): string {
  return useMemo(
    () => (workspaceId ? formatWorkspaceContext(items, workspaceName) : ""),
    [workspaceId, items, workspaceName],
  );
}
