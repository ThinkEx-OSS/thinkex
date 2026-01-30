"use client";

import type { ReactNode } from "react";
import type { FC } from "react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useOptimisticToolUpdate } from "@/hooks/ai/use-optimistic-tool-update";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { ToolUILoadingShell } from "@/components/assistant-ui/tool-ui-loading-shell";
import { parseWorkspaceResult } from "@/lib/ai/tool-result-schemas";

/**
 * Inner component that handles result parsing inside the error boundary.
 */
const DeleteCardInner: FC<{
  result: any;
  status: { type: string; reason?: string };
}> = ({ result, status }) => {
  // Don't try to parse while still running - wait for completion
  let parsed: any = null;
  if (status.type !== "running" && result != null) {
    try {
      parsed = parseWorkspaceResult(result);
    } catch (err) {
      // Log the error but don't throw - we'll show error state below
      console.error("🗑️ [DeleteCardTool] Failed to parse result:", err);
      parsed = null;
    }
  }

  let content: ReactNode = null;

  if (status.type === "complete" && parsed?.success) {
    content = (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800 dark:bg-green-950">
        <div className="size-4 rounded-full bg-green-600 dark:bg-green-400" />
        <p className="text-sm text-green-800 dark:text-green-200">Card deleted successfully</p>
      </div>
    );
  } else if (status.type === "complete" && parsed && !parsed.success) {
    content = (
      <div className="mb-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950">
        <div className="flex items-center gap-2">
          <div className="size-4 rounded-full bg-red-600 dark:bg-red-400" />
          <p className="text-sm font-medium text-red-800 dark:text-red-200">Failed to delete card</p>
        </div>
        {parsed.message && (
          <p className="text-xs text-red-700 dark:text-red-300">{parsed.message}</p>
        )}
      </div>
    );
  } else if (status.type === "incomplete" && status.reason === "error") {
    content = (
      <div className="mb-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950">
        <div className="flex items-center gap-2">
          <div className="size-4 rounded-full bg-red-600 dark:bg-red-400" />
          <p className="text-sm font-medium text-red-800 dark:text-red-200">Failed to delete card</p>
        </div>
        {parsed?.message && (
          <p className="text-xs text-red-700 dark:text-red-300">{parsed.message}</p>
        )}
      </div>
    );
  } else if (status.type === "running") {
    content = <ToolUILoadingShell label="Deleting card..." />;
  }

  return <>{content}</>;
};

DeleteCardInner.displayName = "DeleteCardInner";

export const DeleteCardToolUI = makeAssistantToolUI({
  toolName: "deleteCard",
  render: ({ status, result }) => {
    const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);

    useOptimisticToolUpdate(status, result as any, currentWorkspaceId);

    return (
      <ToolUIErrorBoundary componentName="DeleteCard">
        <DeleteCardInner result={result} status={status} />
      </ToolUIErrorBoundary>
    );
  },
});
