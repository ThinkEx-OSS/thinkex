"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { parseDeepResearchResult } from "@/lib/ai/tool-result-schemas";
import { useOptimisticToolUpdate } from "@/hooks/ai/use-optimistic-tool-update";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";

type DeepResearchArgs = {
  prompt: string;
};

/**
 * DeepResearchToolUI - shows confirmation and triggers workspace refresh via
 * useOptimisticToolUpdate when the tool returns event data.
 */
export const DeepResearchToolUI = makeAssistantToolUI<DeepResearchArgs, { noteId?: string; error?: string }>({
  toolName: "deepResearch",
  render: function DeepResearchUI({ args, result, status }) {
    const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
    useOptimisticToolUpdate(status, result as any, workspaceId);

    const parsed = result != null ? parseDeepResearchResult(result) : null;
    const isComplete = status.type === "complete" || !!parsed?.noteId;
    const hasError = !!parsed?.error;

    return (
      <ToolUIErrorBoundary componentName="DeepResearch">
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

                {hasError && parsed && (
                    <p className="text-xs text-red-500 mt-2">{parsed.error}</p>
                )}

                {isComplete && !hasError && (
                  <p className="text-xs text-muted-foreground mt-2">
                    📋 Check your workspace for the research card with live progress.
                  </p>
                )}
              </div>
            </ToolUIErrorBoundary>
    );
  },
});
