"use client";

import { Search } from "lucide-react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { ToolUILoadingShell } from "@/components/assistant-ui/tool-ui-loading-shell";
import { ToolUIErrorShell } from "@/components/assistant-ui/tool-ui-error-shell";

type GrepArgs = { pattern: string; include?: string; path?: string };
type GrepResult = { success: boolean; matches?: number; output?: string; message?: string };

const MAX_EXCERPTS = 5;
const MAX_EXCERPT_LEN = 80;

function stripExtension(s: string): string {
    return s.replace(/\.[^.]+$/, "");
}

function parseExcerpts(output: string): { path: string; excerpt: string }[] {
    const items: { path: string; excerpt: string }[] = [];
    const lines = output.split("\n");
    let currentPath = "";

    for (const line of lines) {
        if (line.match(/^Found \d+ matches/) || line === "" || line.startsWith("(Results truncated")) continue;
        if (line.endsWith(":") && !line.startsWith("  ")) {
            currentPath = stripExtension(line.slice(0, -1).trim());
        } else if (line.startsWith("  Line ") && currentPath) {
            const match = line.match(/^  Line \d+: (.+)$/);
            const excerpt = match ? match[1].trim() : line.replace(/^  Line \d+: /, "").trim();
            const truncated = excerpt.length > MAX_EXCERPT_LEN ? excerpt.slice(0, MAX_EXCERPT_LEN) + "…" : excerpt;
            items.push({ path: currentPath, excerpt: truncated });
            if (items.length >= MAX_EXCERPTS) break;
        }
    }
    return items;
}

export const SearchWorkspaceToolUI = makeAssistantToolUI<GrepArgs, GrepResult>({
    toolName: "searchWorkspace",
    render: ({ status, result }) => {
        let content: React.ReactNode = null;

        if (status.type === "running") {
            content = <ToolUILoadingShell label="Searching workspace..." />;
        } else if (status.type !== "running" && status.type === "complete" && result) {
            if (!result.success && result.message) {
                content = (
                    <ToolUIErrorShell
                        label="Workspace search failed"
                        message={result.message}
                    />
                );
            } else if (result.success && result.output) {
                const isNoMatches = result.output.startsWith("No matches found");
                const excerpts = isNoMatches ? [] : parseExcerpts(result.output);

                content = (
                    <div className="my-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
                        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <Search className="size-3.5 shrink-0" />
                            <span>
                                Search -{" "}
                                {result.matches != null
                                    ? `${result.matches} match${result.matches !== 1 ? "es" : ""}`
                                    : "completed"}
                            </span>
                        </div>
                        {excerpts.length > 0 && (
                            <ul className="space-y-1.5 text-xs text-muted-foreground">
                                {excerpts.map((item, i) => (
                                    <li key={i} className="flex flex-col gap-0.5">
                                        <span className="font-medium text-foreground/80">{item.path}</span>
                                        <span className="text-muted-foreground">{item.excerpt}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
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
        } else if (status.type !== "running" && status.type === "incomplete" && status.reason === "error") {
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
