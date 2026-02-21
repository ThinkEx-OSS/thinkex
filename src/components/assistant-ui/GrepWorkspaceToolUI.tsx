"use client";

import { Search } from "lucide-react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { ToolUILoadingShell } from "@/components/assistant-ui/tool-ui-loading-shell";
import { ToolUIErrorShell } from "@/components/assistant-ui/tool-ui-error-shell";

type GrepArgs = { pattern: string; include?: string; path?: string };
type GrepResult = { success: boolean; matches?: number; output?: string; message?: string };

function GrepArgsSummary({ args }: { args?: GrepArgs }) {
    if (!args?.pattern) return null;
    const parts = [`pattern: "${args.pattern}"`];
    if (args.include) parts.push(`type: ${args.include}`);
    if (args.path) parts.push(`path: ${args.path}`);
    return (
        <div className="mb-2 text-[10px] text-muted-foreground">
            {parts.join(" · ")}
        </div>
    );
}

export const GrepWorkspaceToolUI = makeAssistantToolUI<GrepArgs, GrepResult>({
    toolName: "grepWorkspace",
    render: ({ args, status, result }) => {
        let content: React.ReactNode = null;

        if (status.type === "running") {
            content = (
                <div className="my-2">
                    <GrepArgsSummary args={args} />
                    <ToolUILoadingShell
                        label={`Searching for "${args?.pattern ?? "..."}"`}
                    />
                </div>
            );
        } else if (status.type === "complete" && result) {
            if (!result.success && result.message) {
                content = (
                    <div className="my-2">
                        <GrepArgsSummary args={args} />
                        <ToolUIErrorShell
                            label="Workspace grep"
                            message={result.message}
                        />
                    </div>
                );
            } else if (result.success && result.output) {
                content = (
                    <div className="my-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
                        <GrepArgsSummary args={args} />
                        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <Search className="size-3.5" />
                            {result.matches != null && (
                                <span>
                                    {result.matches} match
                                    {result.matches !== 1 ? "es" : ""}
                                </span>
                            )}
                        </div>
                        <pre className="whitespace-pre-wrap break-words text-xs font-mono">
                            {result.output}
                        </pre>
                    </div>
                );
            }
        } else if (status.type === "incomplete" && status.reason === "error") {
            content = (
                <div className="my-2">
                    <GrepArgsSummary args={args} />
                    <ToolUIErrorShell
                        label="Workspace grep"
                        message={(result as any)?.message ?? "Search failed"}
                    />
                </div>
            );
        }

        return (
            <ToolUIErrorBoundary componentName="GrepWorkspace">
                {content}
            </ToolUIErrorBoundary>
        );
    },
});
