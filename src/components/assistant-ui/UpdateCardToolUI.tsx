"use client";

import { useEffect, useMemo } from "react";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useQueryClient } from "@tanstack/react-query";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { CheckIcon, Loader2, X, Eye } from "lucide-react";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/lib/stores/ui-store";
import ShinyText from "@/components/ShinyText";



// Type definitions for the tool
type UpdateCardArgs = {
  id: string;
  markdown?: string;
  content?: string;
};

type UpdateCardResult = {
  success: boolean;
  message: string;
  itemId?: string;
};

interface UpdateCardReceiptProps {
  args: UpdateCardArgs;
  result: UpdateCardResult;
  status: any;
}

const UpdateCardReceipt = ({ args, result, status }: UpdateCardReceiptProps) => {
  const setOpenModalItemId = useUIStore((state) => state.setOpenModalItemId);
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
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

export const UpdateCardToolUI = makeAssistantToolUI<UpdateCardArgs, UpdateCardResult>({
  toolName: "updateCard",
  render: function UpdateCardUI({ args, result, status }) {
    const queryClient = useQueryClient();
    const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
    const { state: workspaceState } = useWorkspaceState(workspaceId);

    // Trigger refetch when result is available
    useEffect(() => {
      if (status?.type === "complete" && result && typeof result === "object" && "success" in result && result.success) {
        if (workspaceId) {
          queryClient.invalidateQueries({
            queryKey: ["workspace", workspaceId, "events"],
          });
        } else {
          queryClient.invalidateQueries({ queryKey: ["workspace"] });
        }
      }
    }, [status, result, workspaceId, queryClient]);

    // Show receipt when result is available, or show loading state while updating
    if (result && typeof result === "object" && "success" in result && result.success) {
      return <UpdateCardReceipt args={args} result={result} status={status} />;
    }

    // Show loading state while tool is executing
    if (status.type === "running") {
      return (
        <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border bg-card/50 text-card-foreground shadow-sm">
          <div className="flex items-center gap-2 bg-muted/20 px-4 py-3">
            <ShinyText
              text="Updating card..."
              disabled={false}
              speed={1.5}
              className="text-sm font-semibold"
            />
          </div>
        </div>
      );
    }

    // Show error state
    if (status.type === "complete" && result && typeof result === "object" && "success" in result && !result.success) {
      const errorMessage = "message" in result && typeof result.message === "string" ? result.message : null;
      return (
        <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <div className="flex items-center gap-2">
            <X className="size-4 text-red-600 dark:text-red-400" />
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              Failed to update card
            </p>
          </div>
          {errorMessage && (
            <p className="mt-2 text-xs text-red-700 dark:text-red-300">{errorMessage}</p>
          )}
        </div>
      );
    }

    // Show error state for incomplete/error status
    if (status.type === "incomplete" && status.reason === "error") {
      return (
        <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <div className="flex items-center gap-2">
            <X className="size-4 text-red-600 dark:text-red-400" />
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              Failed to update card
            </p>
          </div>
          {result && typeof result === "object" && "message" in result && typeof result.message === "string" && (
            <p className="mt-2 text-xs text-red-700 dark:text-red-300">{result.message}</p>
          )}
        </div>
      );
    }

    return null;
  },
});
