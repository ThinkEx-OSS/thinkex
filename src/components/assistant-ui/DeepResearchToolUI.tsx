"use client";

import { useEffect } from "react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { toast } from "sonner";

type DeepResearchArgs = {
    prompt: string;
};

type DeepResearchResult = {
    interactionId?: string;
    noteId?: string;
    message?: string;
    error?: string;
    rateLimited?: boolean;
    resetAt?: string;
    userMessage?: string;
};



/**
 * DeepResearchToolUI - shows confirmation and triggers workspace refresh
 * Follows the same pattern as CreateNoteToolUI
 */
export const DeepResearchToolUI = makeAssistantToolUI<DeepResearchArgs, DeepResearchResult>({
    toolName: "deepResearch",
    render: function DeepResearchUI({ args, result, status }) {
        const queryClient = useQueryClient();
        const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);

        const isRateLimited = !!result?.rateLimited;
        const isComplete = status.type === "complete" || !!result?.noteId;
        const hasError = !!result?.error && !isRateLimited;

        // Trigger refetch when result is available
        useEffect(() => {
            if (status?.type === "complete" && result && result.noteId && !result.error && !result.rateLimited) {
                if (workspaceId) {
                    queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId, "events"] });
                } else {
                    queryClient.invalidateQueries({ queryKey: ["workspace"] });
                }
            }
        }, [status, result, workspaceId, queryClient]);

        // Show toast when rate limit is exceeded (globally deduplicated by ID)
        useEffect(() => {
            if (result?.rateLimited) {
                let timeStr = "24 hours";
                if (result.resetAt) {
                    const resetDate = new Date(result.resetAt);
                    // Guard against invalid dates (NaN)
                    if (!isNaN(resetDate.getTime())) {
                        const diffMs = Math.max(0, resetDate.getTime() - Date.now());
                        const hours = Math.floor(diffMs / (1000 * 60 * 60));
                        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                        timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                    }
                }

                toast("Daily limit reached", {
                    id: "deep-research-rate-limit", // Prevents duplicate toasts globally
                    description: `Deep research will be available again in ${timeStr}.`,
                    duration: 5000,
                });
            }
        }, [result]);

        // Don't render anything if rate limited - the toast handles the notification
        if (isRateLimited) {
            return null;
        }

        return (
            <div className="rounded-lg border border-border bg-muted/30 p-4 my-2">
                <div className="flex items-center gap-3">
                    {!isComplete && !hasError && (
                        <Loader2 className="size-5 animate-spin text-blue-500" />
                    )}
                    {isComplete && !hasError && (
                        <CheckCircle2 className="size-5 text-green-500" />
                    )}
                    <div className="flex-1">
                        <p className="font-medium text-sm">
                            {hasError
                                ? "Research Failed"
                                : isComplete
                                    ? "Research Started"
                                    : "Starting Deep Research..."}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {(args?.prompt?.length ?? 0) > 80
                                ? args.prompt.slice(0, 80) + "..."
                                : args?.prompt || "Starting research..."}
                        </p>
                    </div>
                </div>

                {hasError && (
                    <p className="text-xs text-red-500 mt-2">{result?.error}</p>
                )}

                {isComplete && !hasError && (
                    <p className="text-xs text-muted-foreground mt-2">
                        📋 Check your workspace for the research card with live progress.
                    </p>
                )}
            </div>
        );
    },
});
