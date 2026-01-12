"use client";

import { useEffect } from "react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";

type DeepResearchArgs = {
    prompt: string;
};

type DeepResearchResult = {
    interactionId?: string;
    noteId?: string;
    message?: string;
    error?: string;
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

        const isComplete = status.type === "complete" || !!result?.noteId;
        const hasError = !!result?.error;

        // Trigger refetch when result is available
        useEffect(() => {
            if (status?.type === "complete" && result && result.noteId && !result.error) {
                if (workspaceId) {
                    queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId, "events"] });
                } else {
                    queryClient.invalidateQueries({ queryKey: ["workspace"] });
                }
            }
        }, [status, result, workspaceId, queryClient]);

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
