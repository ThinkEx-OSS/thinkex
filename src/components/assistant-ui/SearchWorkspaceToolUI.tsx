"use client";

import { Search } from "lucide-react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { ToolUILoadingShell } from "@/components/assistant-ui/tool-ui-loading-shell";
import { ToolUIErrorShell } from "@/components/assistant-ui/tool-ui-error-shell";

type GrepArgs = { pattern: string; include?: string; path?: string };
type GrepResult = { success: boolean; matches?: number; output?: string; message?: string };

export const SearchWorkspaceToolUI = makeAssistantToolUI<GrepArgs, GrepResult>({
    toolName: "searchWorkspace",
    render: ({ status, result }) => {
        let content: React.ReactNode = null;

        if (status.type === "running") {
            content = <ToolUILoadingShell label="Searching workspace..." />;
        } else if (status.type === "complete" && result) {
            if (!result.success && result.message) {
                content = (
                    <ToolUIErrorShell
                        label="Workspace search failed"
                        message={result.message}
                    />
                );
            } else if (result.success) {
                content = (
                    <div className="my-2 flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
                        <Search className="size-3.5" />
                        <span>
                            Search -{" "}
                            {result.matches != null
                                ? `${result.matches} match${result.matches !== 1 ? "es" : ""}`
                                : "completed"}
                        </span>
                    </div>
                );
            }
        } else if (status.type === "incomplete" && status.reason === "error") {
            content = (
                <ToolUIErrorShell
                    label="Workspace search failed"
                    message={(result as any)?.message ?? "Search failed"}
                />
            );
        }

        return (
            <ToolUIErrorBoundary componentName="SearchWorkspace">
                {content}
            </ToolUIErrorBoundary>
        );
    },
});
