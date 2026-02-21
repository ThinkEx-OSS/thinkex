"use client";

import { Eye } from "lucide-react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { ToolUILoadingShell } from "@/components/assistant-ui/tool-ui-loading-shell";
import { ToolUIErrorShell } from "@/components/assistant-ui/tool-ui-error-shell";

type ReadArgs = { path?: string; itemName?: string };
type ReadResult = {
    success: boolean;
    itemName?: string;
    type?: string;
    path?: string;
    content?: string;
    message?: string;
};

function stripExtension(s: string): string {
    return s.replace(/\.[^.]+$/, "");
}

export const ReadWorkspaceToolUI = makeAssistantToolUI<ReadArgs, ReadResult>({
    toolName: "readWorkspace",
    render: ({ args, status, result }) => {
        let content: React.ReactNode = null;

        if (status.type === "running") {
            const label = args?.path
                ? `Reading ${stripExtension(args.path)}`
                : args?.itemName
                  ? `Reading "${args.itemName}"`
                  : "Reading workspace item...";
            content = <ToolUILoadingShell label={label} />;
        } else if (status.type === "complete" && result) {
            if (!result.success && result.message) {
                content = (
                    <ToolUIErrorShell
                        label="Workspace read"
                        message={result.message}
                    />
                );
            } else if (result.success) {
                content = (
                    <div className="my-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <Eye className="size-3.5 shrink-0" />
                            <span>
                                Read -{" "}
                                {result.path
                                    ? stripExtension(result.path)
                                    : result.itemName}
                                {result.type && (
                                    <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                                        {result.type}
                                    </span>
                                )}
                            </span>
                        </div>
                    </div>
                );
            }
        } else if (status.type === "incomplete" && status.reason === "error") {
            content = (
                <ToolUIErrorShell
                    label="Workspace read"
                    message={(result as any)?.message ?? "Read failed"}
                />
            );
        }

        return (
            <ToolUIErrorBoundary componentName="ReadWorkspace">
                {content}
            </ToolUIErrorBoundary>
        );
    },
});
