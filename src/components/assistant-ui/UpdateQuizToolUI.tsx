"use client";

import type { ReactNode } from "react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { useOptimisticToolUpdate } from "@/hooks/ai/use-optimistic-tool-update";
import { X, Plus, GraduationCap } from "lucide-react";
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
        <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border bg-card/50 text-card-foreground shadow-sm">
            <div className={cn(
                "flex items-center justify-between gap-2 bg-muted/20 px-4 py-3",
                status?.type === "complete" && "border-b"
            )}>
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "flex size-8 items-center justify-center rounded-lg",
                        status?.type === "complete" ? "bg-purple-500/10 text-purple-600" : "bg-red-500/10 text-red-600"
                    )}>
                        {status?.type === "complete" ? (
                            <Plus className="size-4" />
                        ) : (
                            <X className="size-4" />
                        )}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold">
                            {status?.type === "complete" ? "Quiz Expanded" : "Update Cancelled"}
                        </span>
                        {status?.type === "complete" && (
                            <span className="text-xs text-muted-foreground">
                                Added {result.questionsAdded} question{result.questionsAdded !== 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                </div>
                {status?.type === "complete" && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <GraduationCap className="size-3.5" />
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

    const parsed = result != null ? parseQuizResult(result) : null;

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
