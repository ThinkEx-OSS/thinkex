"use client";

import type { ReactNode } from "react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { X, Eye, Play } from "lucide-react";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ToolUILoadingShell } from "@/components/assistant-ui/tool-ui-loading-shell";
import { ToolUIErrorShell } from "@/components/assistant-ui/tool-ui-error-shell";
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
}

const AddYoutubeVideoReceipt = ({
  args,
  result,
  status,
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
          status?.type === "complete" ? "text-red-500" : "text-red-400"
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

    useOptimisticToolUpdate(status, result, workspaceId);

    // Don't try to parse while still running - wait for completion
    let parsed: WorkspaceResult | null = null;
    if (status.type === "complete" && result != null) {
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
        />
      );
    } else if (status.type === "running") {
      content = <ToolUILoadingShell label="Adding YouTube video..." />;
    } else if (status.type === "complete" && parsed && !parsed.success) {
      content = (
        <ToolUIErrorShell
          label="Failed to add YouTube video"
          message={parsed.message}
        />
      );
    } else if (status.type === "incomplete" && status.reason === "error") {
      content = (
        <ToolUIErrorShell
          label="Failed to add YouTube video"
          message={parsed?.message}
        />
      );
    }

    return (
      <ToolUIErrorBoundary componentName="AddYoutubeVideo">
        {content}
      </ToolUIErrorBoundary>
    );
  },
});
