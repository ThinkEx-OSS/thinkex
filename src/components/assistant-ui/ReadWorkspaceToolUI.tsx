"use client";

import { FileText } from "lucide-react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { StandaloneMarkdown } from "@/components/assistant-ui/standalone-markdown";
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

export const ReadWorkspaceToolUI = makeAssistantToolUI<ReadArgs, ReadResult>({
    toolName: "readWorkspace",
    render: ({ args, status, result }) => {
        let content: React.ReactNode = null;

        if (status.type === "running") {
            const label = args?.path
                ? `Reading ${args.path}`
                : args?.itemName
                  ? `Reading "${args.itemName}"`
                  : "Reading workspace item...";
            content = <ToolUILoadingShell label={label} />;
        } else if (status.type === "complete" && result) {
            if (!result.success && result.message) {
                content = (
                    <ToolUIErrorShell
                        label="Read workspace item"
                        message={result.message}
                    />
                );
            } else if (result.success && result.content) {
                content = (
                    <div className="my-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
                        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <FileText className="size-3.5" />
                            <span>
                                {result.path ?? result.itemName}
                                {result.type && (
                                    <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                                        {result.type}
                                    </span>
                                )}
                            </span>
                        </div>
                        <div className="max-h-64 overflow-y-auto text-xs">
                            <StandaloneMarkdown>{result.content}</StandaloneMarkdown>
                        </div>
                    </div>
                );
            }
        } else if (status.type === "incomplete" && status.reason === "error") {
            content = (
                <ToolUIErrorShell
                    label="Read workspace item"
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
