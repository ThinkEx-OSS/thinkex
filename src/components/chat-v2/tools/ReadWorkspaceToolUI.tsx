"use client";

import type { ToolUIProps } from "@/components/chat-v2/tools/types";
import { Eye } from "lucide-react";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { ToolUILoadingShell } from "@/components/chat-v2/tools/ToolUILoadingShell";
import { ToolUIErrorShell } from "@/components/chat-v2/tools/ToolUIErrorShell";

type ReadArgs = { path?: string; itemName?: string; pageStart?: number; pageEnd?: number };
type ReadResult = {
    success: boolean;
    itemName?: string;
    type?: string;
    path?: string;
    content?: string;
    message?: string;
    totalPages?: number;
    pageRange?: { start?: number; end?: number };
};

function stripExtension(s: string): string {
    return s.replace(/\.[^.]+$/, "");
}

export const ReadWorkspaceToolUI: React.FC<ToolUIProps<ReadArgs, ReadResult>> = ({ input, state, output }) => {
  let content: React.ReactNode = null;

  if (state === "input-streaming" || state === "input-available") {
    const pageInfo =
      input?.pageStart != null && input?.pageEnd != null
        ? ` (pages ${input.pageStart}-${input.pageEnd})`
        : input?.pageStart != null
          ? ` (from page ${input.pageStart})`
          : input?.pageEnd != null
            ? ` (to page ${input.pageEnd})`
            : "";
    const label = input?.path
      ? `Reading ${stripExtension(input.path)}${pageInfo}`
      : input?.itemName
        ? `Reading "${input.itemName}"${pageInfo}`
        : "Reading workspace item...";
    content = <ToolUILoadingShell label={label} />;
  } else if (state === "output-available" && output) {
    if (!output.success && output.message) {
      content = (
        <ToolUIErrorShell
          label="Workspace read failed"
          message={output.message}
        />
      );
    } else if (output.success) {
      const pageLabel =
        output.pageRange?.start != null && output.pageRange?.end != null
          ? ` pages ${output.pageRange.start}-${output.pageRange.end}`
          : output.totalPages != null
            ? ` (${output.totalPages} pages)`
            : "";
      content = (
        <div className="my-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Eye className="size-3.5 shrink-0" />
            <span>
              Read - {output.path ? stripExtension(output.path) : output.itemName}
              {pageLabel}
              {output.type && (
                <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                  {output.type}
                </span>
              )}
            </span>
          </div>
        </div>
      );
    }
  } else if (state === "output-error") {
    content = (
      <ToolUIErrorShell
        label="Workspace read failed"
        message={output?.message ?? "Read failed"}
      />
    );
  }

  return (
    <ToolUIErrorBoundary componentName="ReadWorkspace">
      {content}
    </ToolUIErrorBoundary>
  );
};
