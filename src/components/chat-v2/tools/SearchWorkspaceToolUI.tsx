"use client";

import type { ToolUIProps } from "@/components/chat-v2/tools/types";
import { Search } from "lucide-react";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { ToolUILoadingShell } from "@/components/chat-v2/tools/ToolUILoadingShell";
import { ToolUIErrorShell } from "@/components/chat-v2/tools/ToolUIErrorShell";

type GrepArgs = { pattern: string; include?: string; path?: string };
type GrepResult = { success: boolean; matches?: number; output?: string; message?: string };

export const SearchWorkspaceToolUI: React.FC<ToolUIProps<GrepArgs, GrepResult>> = ({ state, output }) => {
  let content: React.ReactNode = null;

  if (state === "input-streaming" || state === "input-available") {
    content = <ToolUILoadingShell label="Searching workspace..." />;
  } else if (state === "output-available" && output) {
    if (!output.success && output.message) {
      content = (
        <ToolUIErrorShell
          label="Workspace search failed"
          message={output.message}
        />
      );
    } else if (output.success) {
      content = (
        <div className="my-2 flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
          <Search className="size-3.5" />
          <span>
            Search -{" "}
            {output.matches != null
              ? `${output.matches} match${output.matches !== 1 ? "es" : ""}`
              : "completed"}
          </span>
        </div>
      );
    }
  } else if (state === "output-error") {
    content = (
      <ToolUIErrorShell
        label="Workspace search failed"
        message={output?.message ?? "Search failed"}
      />
    );
  }

  return (
    <ToolUIErrorBoundary componentName="SearchWorkspace">
      {content}
    </ToolUIErrorBoundary>
  );
};
