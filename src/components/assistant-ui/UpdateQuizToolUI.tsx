"use client";

import type { ReactNode } from "react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { useOptimisticToolUpdate } from "@/hooks/ai/use-optimistic-tool-update";
import { X, Plus, Brain } from "lucide-react";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { cn } from "@/lib/utils";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { ToolUILoadingShell } from "@/components/assistant-ui/tool-ui-loading-shell";
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
    return (
    <div className="my-1 flex w-full items-center justify-between overflow-hidden rounded-md border border-border/50 bg-card/50 text-card-foreground shadow-sm px-2 py-2">
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
            {status?.type === "complete" ? "Quiz Expanded" : "Update Cancelled"}
          </span>
          {status?.type === "complete" && (
            <span className="text-[10px] text-muted-foreground">
              Added {result.questionsAdded} question{result.questionsAdded !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-1">
        {status?.type === "complete" && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Brain className="size-3" />
            <span>{result.totalQuestions} total</span>
          </div>
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
    if (status.type !== "running" && result != null) {
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
    } else if (status.type === "incomplete" && status.reason === "error") {
      content = (
        <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <div className="flex items-center gap-2">
            <X className="size-4 text-red-600 dark:text-red-400" />
            <p className="text-sm font-medium text-red-800 dark:text-red-200">Failed to add questions</p>
          </div>
          {parsed && !parsed.success && parsed.message && (
            <p className="mt-2 text-xs text-red-700 dark:text-red-300">{parsed.message}</p>
          )}
        </div>
      );
    }

    return (
      <ToolUIErrorBoundary componentName="UpdateQuiz">
        {content}
      </ToolUIErrorBoundary>
    );
  },
});
