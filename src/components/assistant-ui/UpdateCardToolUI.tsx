"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { useOptimisticToolUpdate } from "@/hooks/ai/use-optimistic-tool-update";
import { CheckIcon, Loader2, X, Eye } from "lucide-react";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/lib/stores/ui-store";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { ToolUILoadingShell } from "@/components/assistant-ui/tool-ui-loading-shell";
import type { WorkspaceResult } from "@/lib/ai/tool-result-schemas";
import { parseWorkspaceResult } from "@/lib/ai/tool-result-schemas";

type UpdateCardArgs = { id: string; markdown?: string; content?: string };

interface UpdateCardReceiptProps {
  args: UpdateCardArgs;
  result: WorkspaceResult;
  status: any;
}

const UpdateCardReceipt = ({ args, result, status }: UpdateCardReceiptProps) => {
  const setOpenModalItemId = useUIStore((s) => s.setOpenModalItemId);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { state: workspaceState } = useWorkspaceState(workspaceId);

  // Check if the card has appeared in the workspace with updated content
  const isCardInWorkspace = useMemo(() => {
    if (!result.itemId || !workspaceState?.items) return false;
    return workspaceState.items.some((item: any) => item.id === result.itemId);
  }, [result.itemId, workspaceState?.items]);

  // Get the card from workspace to show its title
  const card = useMemo(() => {
    if (!result.itemId || !workspaceState?.items) return null;
    return workspaceState.items.find((item: any) => item.id === result.itemId);
  }, [result.itemId, workspaceState?.items]);

  const handleViewCard = () => {
    if (!result.itemId) return;
    const element = document.getElementById(`item-${result.itemId}`);
    if (element) {
      // Find the scrollable container (the one with overflow-auto in WorkspaceSection)
      // We traverse up until we find the container with overflow-auto
      let container = element.parentElement;
      while (container && container !== document.body) {
        const style = window.getComputedStyle(container);
        // Check for overflow-auto or overflow-scroll
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          break;
        }
        container = container.parentElement;
      }

      if (container && container !== document.body) {
        // Calculate position to scroll to (center the element)
        const elementRect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const relativeTop = elementRect.top - containerRect.top;

        container.scrollTo({
          top: container.scrollTop + relativeTop - (container.clientHeight / 2) + (element.clientHeight / 2),
          behavior: 'smooth'
        });
      } else {
        // Fallback if no specific container found
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    // Open the modal
    if (result.itemId) {
      setOpenModalItemId(result.itemId);
    }
  };

  return (
    <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border bg-card/50 text-card-foreground shadow-sm">
      <div className={cn(
        "flex items-center justify-between gap-2 bg-muted/20 px-4 py-3",
        status?.type === "complete" && "border-b"
      )}>
        <div className="flex items-center gap-2">
          <div className={cn(
            "flex size-8 items-center justify-center rounded-lg",
            status?.type === "complete" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
          )}>
            {status?.type === "complete" ? (
              isCardInWorkspace ? (
                <CheckIcon className="size-4" />
              ) : (
                <Loader2 className="size-4 animate-spin" />
              )
            ) : (
              <X className="size-4" />
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">
              {status?.type === "complete" ? "Card Updated" : "Update Cancelled"}
            </span>
            {status?.type === "complete" && (
              <span className="text-xs text-muted-foreground">
                {isCardInWorkspace ? "Changes saved to workspace" : "Saving changes..."}
              </span>
            )}
          </div>
        </div>
        {status?.type === "complete" && result.itemId && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleViewCard}
          >
            <Eye className="size-3.5" />
            View
          </Button>
        )}
      </div>

      {status?.type === "complete" && card && (
        <div className="flex flex-col gap-2 p-4">
          <div>
            <h3 className="font-semibold text-base">{card.name}</h3>
          </div>
        </div>
      )}
    </div>
  );
};

export const UpdateCardToolUI = makeAssistantToolUI<UpdateCardArgs, WorkspaceResult>({
  toolName: "updateCard",
  render: function UpdateCardUI({ args, result, status }) {
    const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);

    useOptimisticToolUpdate(status, result as any, workspaceId);

    const parsed = result != null ? parseWorkspaceResult(result) : null;

    let content: ReactNode = null;

    if (parsed?.success) {
      content = <UpdateCardReceipt args={args} result={parsed} status={status} />;
    } else if (status.type === "running") {
      content = <ToolUILoadingShell label="Updating card..." />;
    } else if (status.type === "complete" && parsed && !parsed.success) {
      content = (
        <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <div className="flex items-center gap-2">
            <X className="size-4 text-red-600 dark:text-red-400" />
            <p className="text-sm font-medium text-red-800 dark:text-red-200">Failed to update card</p>
          </div>
          {parsed.message && <p className="mt-2 text-xs text-red-700 dark:text-red-300">{parsed.message}</p>}
        </div>
      );
    } else if (status.type === "incomplete" && status.reason === "error") {
      content = (
        <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <div className="flex items-center gap-2">
            <X className="size-4 text-red-600 dark:text-red-400" />
            <p className="text-sm font-medium text-red-800 dark:text-red-200">Failed to update card</p>
          </div>
          {parsed?.message && <p className="mt-2 text-xs text-red-700 dark:text-red-300">{parsed.message}</p>}
        </div>
      );
    }

    return (
      <ToolUIErrorBoundary componentName="UpdateCard">
        {content}
      </ToolUIErrorBoundary>
    );
  },
});
