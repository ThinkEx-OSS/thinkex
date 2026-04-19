"use client";

import type { ReactNode } from "react";
import type { ToolUIProps, ToolUIState } from "@/components/chat-v2/tools/types";
import { X, Eye, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ToolUILoadingShell } from "@/components/chat-v2/tools/ToolUILoadingShell";
import { ToolUIErrorShell } from "@/components/chat-v2/tools/ToolUIErrorShell";
import { useNavigateToItem } from "@/hooks/ui/use-navigate-to-item";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import type { WorkspaceResult } from "@/lib/ai/tool-result-schemas";
import { parseWorkspaceResult } from "@/lib/ai/tool-result-schemas";

type AddYoutubeVideoArgs = { videoId: string; title: string };

interface AddYoutubeVideoReceiptProps {
  args: AddYoutubeVideoArgs;
  result: WorkspaceResult;
  state: ToolUIState;
}

const AddYoutubeVideoReceipt = ({
  args,
  result,
  state,
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
        state === "output-available" &&
          result.itemId &&
          "cursor-pointer hover:bg-accent transition-colors",
      )}
      onClick={
        state === "output-available" && result.itemId
          ? handleViewCard
          : undefined
      }
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div
          className={cn(
            state === "output-available" ? "text-red-500" : "text-red-400",
          )}
        >
          {state === "output-available" ? (
            <Play className="size-4" />
          ) : (
            <X className="size-4" />
          )}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-xs font-medium truncate">
            {state === "output-available"
              ? args.title
              : "Video Addition Cancelled"}
          </span>
          {state === "output-available" && (
            <span className="text-[10px] text-muted-foreground">
              YouTube video added
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {state === "output-available" && result.itemId && (
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

export const AddYoutubeVideoToolUI: React.FC<ToolUIProps<AddYoutubeVideoArgs, WorkspaceResult>> = ({ input, output, state, errorText }) => {
  const args = input as AddYoutubeVideoArgs;
  let parsed: WorkspaceResult | null = null;
  if (state === "output-available" && output != null) {
    try {
      parsed = parseWorkspaceResult(output);
    } catch (err) {
      console.error("🎥 [AddYoutubeVideoTool] Failed to parse result:", err);
      parsed = null;
    }
  }

  let content: ReactNode = null;
  const statusErrorMessage =
    state === "output-error" ? errorText : undefined;

  if (parsed?.success) {
    content = <AddYoutubeVideoReceipt args={args} result={parsed} state={state} />;
  } else if (state === "input-streaming" || state === "input-available") {
    content = <ToolUILoadingShell label="Adding YouTube video..." />;
  } else if (state === "output-available" && parsed && !parsed.success) {
    content = (
      <ToolUIErrorShell
        label="Failed to add YouTube video"
        message={parsed.message}
      />
    );
  } else if (state === "output-error") {
    content = (
      <ToolUIErrorShell
        label="Failed to add YouTube video"
        message={statusErrorMessage}
      />
    );
  }

  return (
    <ToolUIErrorBoundary componentName="AddYoutubeVideo">
      {content}
    </ToolUIErrorBoundary>
  );
};
