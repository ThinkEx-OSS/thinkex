import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { X, Plus, GraduationCap } from "lucide-react";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { cn } from "@/lib/utils";
import ShinyText from "@/components/ShinyText";

// Type definitions for the tool
type UpdateQuizArgs = {
    quizId: string;
};

type UpdateQuizResult = {
    success: boolean;
    message: string;
    itemId?: string;
    questionsAdded?: number;
    totalQuestions?: number;
};

const UpdateQuizReceipt = ({
    result,
    status,
}: {
    result: UpdateQuizResult;
    status: any;
}) => {
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

export const UpdateQuizToolUI = makeAssistantToolUI<UpdateQuizArgs, UpdateQuizResult>({
    toolName: "updateQuiz",
    render: function UpdateQuizUI({ args, result, status }) {
        const queryClient = useQueryClient();
        const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);

        // Track if we've already triggered refetch for this result
        const hasRefetchedRef = useRef<string | null>(null);

        // Trigger refetch when result is available (only once per result)
        useEffect(() => {
            if (status?.type === "complete" && result && result.success && workspaceId) {
                // Use itemId as unique identifier to prevent duplicate refetches
                const refetchKey = `${result.itemId}-${result.totalQuestions}`;
                if (hasRefetchedRef.current === refetchKey) {
                    return; // Already refetched for this result
                }
                hasRefetchedRef.current = refetchKey;

                // Small delay to ensure database has processed the event
                // Then invalidate cache and refetch to get fresh data
                setTimeout(() => {
                    // Invalidate the cache to force fresh fetch
                    queryClient.invalidateQueries({
                        queryKey: ["workspace", workspaceId, "events"],
                    });
                    // Then refetch
                    queryClient.refetchQueries({
                        queryKey: ["workspace", workspaceId, "events"],
                        type: 'active'
                    }).catch((err) => {
                        console.error("❌ [UpdateQuizTool] Refetch failed:", err);
                    });
                }, 500); // 500ms delay for database processing
            }
        }, [status, result, workspaceId, queryClient]);

        // Show receipt when result is available
        if (result && result.success) {
            return <UpdateQuizReceipt result={result} status={status} />;
        }

        // Show loading state while tool is executing
        if (status.type === "running") {
            return (
                <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border bg-card/50 text-card-foreground shadow-sm">
                    <div className="flex items-center gap-2 bg-muted/20 px-4 py-3">
                        <ShinyText
                            text="Adding more questions..."
                            disabled={false}
                            speed={1.5}
                            className="text-sm font-semibold"
                        />
                    </div>
                </div>
            );
        }

        // Show error state
        if (status.type === "incomplete" && status.reason === "error") {
            return (
                <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
                    <div className="flex items-center gap-2">
                        <X className="size-4 text-red-600 dark:text-red-400" />
                        <p className="text-sm font-medium text-red-800 dark:text-red-200">
                            Failed to add questions
                        </p>
                    </div>
                    {result && !result.success && result.message && (
                        <p className="mt-2 text-xs text-red-700 dark:text-red-300">{result.message}</p>
                    )}
                </div>
            );
        }

        return null;
    },
});
