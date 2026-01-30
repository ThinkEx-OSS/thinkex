"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { CheckIcon, X, Eye, Play } from "lucide-react";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ToolUILoadingShell } from "@/components/assistant-ui/tool-ui-loading-shell";
import { useOptimisticToolUpdate } from "@/hooks/ai/use-optimistic-tool-update";
import { useNavigateToItem } from "@/hooks/ui/use-navigate-to-item";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import type { WorkspaceResult } from "@/lib/ai/tool-result-schemas";
import { parseWorkspaceResult } from "@/lib/ai/tool-result-schemas";

type AddYoutubeVideoArgs = { videoId: string; title: string };

interface AddYoutubeVideoReceiptProps {
  args: AddYoutubeVideoArgs;
  result: WorkspaceResult;
  status: any;
  workspaceName?: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
}

const AddYoutubeVideoReceipt = ({
  args,
  result,
  status,
  workspaceName = "Workspace",
  workspaceIcon,
  workspaceColor,
}: AddYoutubeVideoReceiptProps) => {
  const navigateToItem = useNavigateToItem();

  const handleViewCard = () => {
    if (!result.itemId) return;
    navigateToItem(result.itemId);
  };

  return (
    <div 
      className={cn(
        "my-1 flex w-full items-center justify-between overflow-hidden rounded-md border border-border/50 bg-card/50 text-card-foreground shadow-sm px-2 py-2",
        status?.type === "complete" && result.itemId && "cursor-pointer hover:bg-accent transition-colors"
      )}
      onClick={status?.type === "complete" && result.itemId ? handleViewCard : undefined}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className={cn(
          status?.type === "complete" ? "text-red-400" : "text-red-400"
        )}>
          {status?.type === "complete" ? (
            <Play className="size-4" />
          ) : (
            <X className="size-4" />
          )}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-xs font-medium truncate">
            {status?.type === "complete" ? args.title : "Video Addition Cancelled"}
          </span>
          {status?.type === "complete" && (
            <span className="text-[10px] text-muted-foreground">
              YouTube video added
            </span>
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
  );
};

export const AddYoutubeVideoToolUI = makeAssistantToolUI<AddYoutubeVideoArgs, WorkspaceResult>({
  toolName: "addYoutubeVideo",
  render: function AddYoutubeVideoToolUI({ args, result, status }) {
    const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
    const workspaceContext = useWorkspaceContext();
    const currentWorkspace = workspaceContext.workspaces.find((w) => w.id === workspaceId);

    useOptimisticToolUpdate(status, result, workspaceId);

    // Don't try to parse while still running - wait for completion
    let parsed: WorkspaceResult | null = null;
    if (status.type !== "running" && result != null) {
        try {
            parsed = parseWorkspaceResult(result);
        } catch (err) {
            // Log the error but don't throw - we'll show error state below
            console.error("🎥 [AddYoutubeVideoTool] Failed to parse result:", err);
            parsed = null;
        }
    }

    let content: ReactNode = null;

    if (parsed?.success) {
      content = (
        <AddYoutubeVideoReceipt
          args={args}
          result={parsed}
          status={status}
          workspaceName={currentWorkspace?.name || "Workspace"}
          workspaceIcon={currentWorkspace?.icon}
          workspaceColor={currentWorkspace?.color}
        />
      );
    } else if (status.type === "running") {
      content = <ToolUILoadingShell label="Adding YouTube video..." />;
    } else if (status.type === "incomplete" && status.reason === "error") {
      content = (
        <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <div className="flex items-center gap-2">
            <X className="size-4 text-red-600 dark:text-red-400" />
            <p className="text-sm font-medium text-red-800 dark:text-red-200">Failed to add YouTube video</p>
          </div>
          {parsed && !parsed.success && parsed.message && (
            <p className="mt-2 text-xs text-red-700 dark:text-red-300">{parsed.message}</p>
          )}
        </div>
      );
    }

    return (
      <ToolUIErrorBoundary componentName="AddYoutubeVideo">
        {content}
      </ToolUIErrorBoundary>
    );
  },
});
