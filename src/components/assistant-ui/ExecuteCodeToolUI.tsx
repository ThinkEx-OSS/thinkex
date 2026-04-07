"use client";

import { CheckCircle2Icon } from "lucide-react";
import type { AssistantToolUIProps } from "@assistant-ui/react";

import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { ToolUILoadingShell } from "@/components/assistant-ui/tool-ui-loading-shell";
import { cn } from "@/lib/utils";
import type { CodeExecuteResult } from "@/lib/ai/tool-result-schemas";

/**
 * Lay-friendly tool UI: no prompts, code, or technical labels.
 * Full structured output stays in the tool result for the model only.
 */
export const renderExecuteCodeToolUI: AssistantToolUIProps<
  { task: string },
  CodeExecuteResult
>["render"] = ({ status }) => {
  return (
    <ToolUIErrorBoundary componentName="ExecuteCode">
      {status.type === "running" ? (
        <ToolUILoadingShell label="Calculating…" />
      ) : status.type === "incomplete" ? (
        <div
          className={cn(
            "my-1 rounded-md border border-border/50 bg-card/50 px-3 py-2 text-xs text-muted-foreground",
          )}
        >
          Couldn’t complete this step. Try again or rephrase your question.
        </div>
      ) : (
        <div
          className={cn(
            "my-1 flex items-center gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground",
          )}
        >
          <CheckCircle2Icon
            className="size-3.5 shrink-0 text-muted-foreground/80"
            aria-hidden
          />
          <span>Done</span>
        </div>
      )}
    </ToolUIErrorBoundary>
  );
};
