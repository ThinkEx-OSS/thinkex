"use client";

import { CheckCircle2Icon } from "lucide-react";
import type { AssistantToolUIProps } from "@assistant-ui/react";

import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { ToolUILoadingShell } from "@/components/assistant-ui/tool-ui-loading-shell";
import { cn } from "@/lib/utils";
import type { EscalateModelResult } from "@/lib/ai/tool-result-schemas";

/**
 * Minimal tool UI for escalate_model — shows the model upgrade status.
 */
export const renderEscalateModelToolUI: AssistantToolUIProps<
  { reason: string },
  EscalateModelResult
>["render"] = ({ status }) => {
  return (
    <ToolUIErrorBoundary componentName="EscalateModel">
      {status.type === "running" ? (
        <ToolUILoadingShell label="Upgrading model…" />
      ) : status.type === "incomplete" ? (
        <div
          className={cn(
            "my-1 rounded-md border border-border/50 bg-card/50 px-3 py-2 text-xs text-muted-foreground",
          )}
        >
          Model upgrade could not complete.
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
          <span>Model upgraded</span>
        </div>
      )}
    </ToolUIErrorBoundary>
  );
};
