"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import ShinyText from "@/components/ShinyText";



export const ClearCardContentToolUI = makeAssistantToolUI({
    toolName: "clearCardContent",
    render: function ClearCardContentUI({ result, status }) {
        const queryClient = useQueryClient();
        const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
        const hasTriggeredRefetch = useRef(false);

        // When the tool completes successfully, invalidate queries immediately
        useEffect(() => {
            if (status.type === "complete" && result && typeof result === "object" && "success" in result && result.success && !hasTriggeredRefetch.current) {
                hasTriggeredRefetch.current = true;
                queryClient.invalidateQueries({
                    queryKey: ["workspace", workspaceId, "events"],
                });
            }
        }, [status, result, workspaceId, queryClient]);

        // Show success state
        if (status.type === "complete" && result && typeof result === "object" && "success" in result && result.success) {
            return (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800 dark:bg-green-950">
                    <div className="size-4 rounded-full bg-green-600 dark:bg-green-400" />
                    <p className="text-sm text-green-800 dark:text-green-200">
                        Card content cleared successfully
                    </p>
                </div>
            );
        }

        // Show error state
        if (status.type === "complete" && result && typeof result === "object" && "success" in result && !result.success) {
            const errorResult = result as { success: boolean; message?: string };
            return (
                <div className="mb-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950">
                    <div className="flex items-center gap-2">
                        <div className="size-4 rounded-full bg-red-600 dark:bg-red-400" />
                        <p className="text-sm font-medium text-red-800 dark:text-red-200">
                            Failed to clear card content
                        </p>
                    </div>
                    {errorResult.message && (
                        <p className="text-xs text-red-700 dark:text-red-300">
                            {errorResult.message}
                        </p>
                    )}
                </div>
            );
        }

        // Show loading state
        if (status.type === "running") {
            return (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950">
                    <div className="size-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent dark:border-blue-400" />
                    <ShinyText
                        text="Clearing card content..."
                        disabled={false}
                        speed={1.5}
                        className="text-sm text-blue-800 dark:text-blue-200"
                    />
                </div>
            );
        }

        // Default fallback - return null to hide
        return null;
    },
});
