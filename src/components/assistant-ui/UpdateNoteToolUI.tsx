"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { useOptimisticToolUpdate } from "@/hooks/ai/use-optimistic-tool-update";
import { X, Eye, FileText } from "lucide-react";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/lib/stores/ui-store";
import { useNavigateToItem } from "@/hooks/ui/use-navigate-to-item";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { ToolUILoadingShell } from "@/components/assistant-ui/tool-ui-loading-shell";
import { ToolUIErrorShell } from "@/components/assistant-ui/tool-ui-error-shell";
import { DiffViewer } from "@/components/assistant-ui/diff-viewer";
import type { WorkspaceResult } from "@/lib/ai/tool-result-schemas";
import { parseWorkspaceResult } from "@/lib/ai/tool-result-schemas";

type UpdateNoteArgs = { noteName: string; oldString: string; newString: string; replaceAll?: boolean };

interface UpdateNoteResult extends WorkspaceResult {
  diff?: string;
  filediff?: { additions: number; deletions: number };
}

interface UpdateNoteReceiptProps {
  args: UpdateNoteArgs;
  result: UpdateNoteResult;
  status: any;
}

const UpdateNoteReceipt = ({ args, result, status }: UpdateNoteReceiptProps) => {
  const setOpenModalItemId = useUIStore((s) => s.setOpenModalItemId);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { state: workspaceState } = useWorkspaceState(workspaceId);
  const navigateToItem = useNavigateToItem();

  // Get the card from workspace to show its title
  const card = useMemo(() => {
    if (!result.itemId || !workspaceState?.items) return null;
    return workspaceState.items.find((item: any) => item.id === result.itemId);
  }, [result.itemId, workspaceState?.items]);

  const handleViewCard = () => {
    if (!result.itemId) return;
    // Only open modal if item exists and navigation succeeds
    if (navigateToItem(result.itemId)) {
      setOpenModalItemId(result.itemId);
    }
  };

  const hasDiff = result.diff && result.diff.trim().length > 0;

  return (
    <div className="my-1 flex flex-col gap-2">
      <div
        className={cn(
          "flex w-full items-center justify-between overflow-hidden rounded-md border border-border/50 bg-card/50 text-card-foreground shadow-sm px-2 py-2",
          status?.type === "complete" && result.itemId && "cursor-pointer hover:bg-accent transition-colors"
        )}
        onClick={status?.type === "complete" && result.itemId ? handleViewCard : undefined}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            className={cn(status?.type === "complete" ? "text-blue-400" : "text-red-400")}
          >
            {status?.type === "complete" ? (
              <FileText className="size-4" />
            ) : (
              <X className="size-4" />
            )}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-medium truncate">
              {status?.type === "complete" ? (card?.name || "Card Updated") : "Update Cancelled"}
            </span>
            {status?.type === "complete" && (
              <span className="text-[10px] text-muted-foreground">Note updated</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {status?.type === "complete" && result.itemId && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 text-[10px] px-2"
              onClick={(e) => {
                e.stopPropagation();
                handleViewCard();
              }}
            >
              <Eye className="size-3" />
              View
            </Button>
          )}
        </div>
      </div>

      {hasDiff && (
        <DiffViewer
          patch={result.diff}
          viewMode="unified"
          size="xs"
          variant="muted"
          showIcon={false}
          showLineNumbers={false}
          renderMarkdown
          className="max-h-48 overflow-y-auto"
        />
      )}
    </div>
  );
};

export const UpdateNoteToolUI = makeAssistantToolUI<UpdateNoteArgs, WorkspaceResult>({
  toolName: "updateNote",
  render: function UpdateNoteUI({ args, result, status }) {
    const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);

    useOptimisticToolUpdate(status, result as any, workspaceId);

    // Don't try to parse while still running - wait for completion
    let parsed: WorkspaceResult | null = null;
    if (status.type === "complete" && result != null) {
      try {
        parsed = parseWorkspaceResult(result);
      } catch (err) {
        // Log the error but don't throw - we'll show error state below
        console.error("📝 [UpdateNoteTool] Failed to parse result:", err);
        parsed = null;
      }
    }

    let content: ReactNode = null;

    if (parsed?.success) {
      content = <UpdateNoteReceipt args={args} result={parsed as UpdateNoteResult} status={status} />;
    } else if (status.type === "running") {
      content = <ToolUILoadingShell label="Updating note..." />;
    } else if (status.type !== "running" && status.type === "complete" && parsed && !parsed.success) {
      content = (
        <ToolUIErrorShell
          label="Failed to update note"
          message={parsed.message}
        />
      );
    } else if (status.type !== "running" && status.type === "incomplete" && status.reason === "error") {
      content = (
        <ToolUIErrorShell
          label="Failed to update note"
          message={parsed?.message}
        />
      );
    }

    return (
      <ToolUIErrorBoundary componentName="UpdateNote">
        {content}
      </ToolUIErrorBoundary>
    );
  },
});
