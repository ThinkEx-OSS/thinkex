"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { useOptimisticToolUpdate } from "@/hooks/ai/use-optimistic-tool-update";
import { X, Plus, Eye } from "lucide-react";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { ToolUILoadingShell } from "@/components/assistant-ui/tool-ui-loading-shell";
import { ToolUIErrorShell } from "@/components/assistant-ui/tool-ui-error-shell";
import { useNavigateToItem } from "@/hooks/ui/use-navigate-to-item";
import type { QuizResult } from "@/lib/ai/tool-result-schemas";
import { parseQuizResult } from "@/lib/ai/tool-result-schemas";

type UpdateQuizArgs = {
  quizId: string;
  topic?: string;
  contextContent?: string;
  sourceCardIds?: string[];
  sourceCardNames?: string[];
};

const UpdateQuizReceipt = ({ result, status }: { result: QuizResult; status: any }) => {
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { state: workspaceState } = useWorkspaceState(workspaceId);
  const navigateToItem = useNavigateToItem();

  const targetId = result.itemId || result.quizId;

  // Get the quiz from workspace to show its title
  const quiz = useMemo(() => {
    if (!targetId || !workspaceState?.items) return null;
    return workspaceState.items.find((item: any) => item.id === targetId);
  }, [targetId, workspaceState?.items]);

  const handleViewCard = () => {
    if (!targetId) return;
    navigateToItem(targetId);
  };

  return (
    <div
      className={cn(
        "my-1 flex w-full items-center justify-between overflow-hidden rounded-md border border-border/50 bg-card/50 text-card-foreground shadow-sm px-2 py-2",
        status?.type === "complete" && targetId && "cursor-pointer hover:bg-accent transition-colors"
      )}
      onClick={status?.type === "complete" && targetId ? handleViewCard : undefined}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className={cn(
          status?.type === "complete" ? "text-green-400" : "text-red-400"
        )}>
          {status?.type === "complete" ? (
            <Plus className="size-4" />
          ) : (
            <X className="size-4" />
          )}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-xs font-medium truncate">
            {status?.type === "complete" ? (quiz?.name || "Quiz Expanded") : "Update Cancelled"}
          </span>
          {status?.type === "complete" && (
            <span className="text-[10px] text-muted-foreground">
              Added {result.questionsAdded} question{result.questionsAdded !== 1 ? 's' : ''} ({result.totalQuestions} total)
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {status?.type === "complete" && targetId && (
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

export const UpdateQuizToolUI = makeAssistantToolUI<UpdateQuizArgs, QuizResult>({
  toolName: "updateQuiz",
  render: function UpdateQuizUI({ args, result, status }) {
    const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);

    useOptimisticToolUpdate(status, result, workspaceId);

    // Don't try to parse while still running - wait for completion
    let parsed: QuizResult | null = null;
    if (status.type === "complete" && result != null) {
      try {
        // With the new Output.object() approach, the quiz worker returns clean structured data
        // so we can parse normally without special streaming handling
        parsed = parseQuizResult(result);
      } catch (err) {
        // Log the error but don't throw - we'll show error state below
        console.error("🎯 [UpdateQuizTool] Failed to parse result:", err);
        parsed = null;
      }
    }

    let content: ReactNode = null;

    if (parsed?.success) {
      content = <UpdateQuizReceipt result={parsed} status={status} />;
    } else if (status.type === "running") {
      content = <ToolUILoadingShell label="Adding more questions..." />;
    } else if (status.type === "complete" && parsed && !parsed.success) {
      content = (
        <ToolUIErrorShell
          label="Failed to add questions"
          message={parsed.message}
        />
      );
    } else if (status.type === "incomplete" && status.reason === "error") {
      content = (
        <ToolUIErrorShell
          label="Failed to add questions"
          message={parsed?.message}
        />
      );
    }

    return (
      <ToolUIErrorBoundary componentName="UpdateQuiz">
        {content}
      </ToolUIErrorBoundary>
    );
  },
});
