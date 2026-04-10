"use client";

import type { ReactNode } from "react";
import {
  makeAssistantToolUI,
  type AssistantToolUIProps,
} from "@assistant-ui/react";
import { AlertCircle, CheckCircle2, Clock3, Wrench } from "lucide-react";
import { ToolUILoadingShell } from "@/components/assistant-ui/tool-ui-loading-shell";
import { ToolUIErrorShell } from "@/components/assistant-ui/tool-ui-error-shell";
import { Badge } from "@/components/ui/badge";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { parseCodeComposeResult } from "@/lib/ai/tool-result-schemas";
import type { CodeComposeResult } from "@/lib/ai/code-compose-shared";
import { CHAT_TOOL } from "@/lib/ai/chat-tool-names";
import { cn } from "@/lib/utils";

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  web_search: "Web Search",
  web_fetch: "Fetch URLs",
  workspace_search: "Search Workspace",
  workspace_read: "Read Workspace",
  document_create: "Create Document",
  item_edit: "Edit Item",
  item_delete: "Delete Item",
  flashcards_create: "Create Flashcards",
  quiz_create: "Create Quiz",
  youtube_search: "YouTube Search",
  youtube_add: "Add YouTube Video",
};

function getToolStatusErrorMessage(status: unknown): string | undefined {
  if (!status || typeof status !== "object") return undefined;
  const value = status as Record<string, unknown>;
  if (typeof value.error === "string") return value.error;
  if (typeof value.message === "string") return value.message;
  if (
    value.payload &&
    typeof value.payload === "object" &&
    typeof (value.payload as Record<string, unknown>).message === "string"
  ) {
    return (value.payload as Record<string, unknown>).message as string;
  }
  return undefined;
}

function getToolDisplayName(canonicalTool: string): string {
  if (TOOL_DISPLAY_NAMES[canonicalTool]) {
    return TOOL_DISPLAY_NAMES[canonicalTool];
  }

  return canonicalTool
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDuration(durationMs: number): string {
  return `${Math.round(durationMs)} ms`;
}

type CodeComposeArgs = { code: string };

const CodeComposeSummary = ({ result }: { result: CodeComposeResult }) => {
  const externalCalls = result.trace?.externalCalls ?? [];
  const totalDurationMs = result.trace?.totalDurationMs;

  return (
    <div
      className={cn(
        "my-1 w-full rounded-md border border-border/50 bg-card/50 px-3 py-2 text-card-foreground shadow-sm",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <CheckCircle2
            className="size-4 shrink-0 text-emerald-500"
            aria-hidden
          />
          <span className="truncate text-xs font-medium">Code Compose</span>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] text-emerald-600 dark:text-emerald-400"
        >
          Succeeded
        </Badge>
      </div>

      {externalCalls.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {externalCalls.map((call, index) => {
            const callFailed = Boolean(call.error);
            return (
              <div
                key={`${call.canonicalTool}-${call.functionName}-${index}`}
                className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-muted/20 px-2 py-1.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Wrench
                    className="size-3.5 shrink-0 text-muted-foreground/70"
                    aria-hidden
                  />
                  <span className="truncate text-xs font-medium text-foreground/90">
                    {getToolDisplayName(call.canonicalTool)}
                  </span>
                  {callFailed && (
                    <Badge variant="destructive" className="text-[10px]">
                      Failed
                    </Badge>
                  )}
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {formatDuration(call.durationMs)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-2 rounded-md border border-dashed border-border/50 bg-muted/10 px-2 py-1.5 text-[10px] text-muted-foreground">
          No external tools called
        </div>
      )}

      {typeof totalDurationMs === "number" && (
        <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-3" aria-hidden />
            Total time
          </span>
          <span>{formatDuration(totalDurationMs)}</span>
        </div>
      )}
    </div>
  );
};

const CodeComposeToolUIComponent = makeAssistantToolUI<
  CodeComposeArgs,
  CodeComposeResult
>({
  toolName: CHAT_TOOL.CODE_COMPOSE,
  render: ({ result, status }) => {
    let parsed: CodeComposeResult | null = null;
    if (status.type === "complete" && result != null) {
      try {
        parsed = parseCodeComposeResult(result);
      } catch (error) {
        console.error("[CodeComposeToolUI] Failed to parse result", error);
      }
    }

    let content: ReactNode = null;

    if (status.type === "running") {
      content = <ToolUILoadingShell label="Composing..." />;
    } else if (status.type === "complete" && parsed?.success) {
      content = <CodeComposeSummary result={parsed} />;
    } else if (status.type === "complete") {
      content = (
        <ToolUIErrorShell
          label="Code Compose failed"
          message={parsed?.error ?? "Execution failed"}
        />
      );
    } else if (status.type === "incomplete" && status.reason === "error") {
      content = (
        <ToolUIErrorShell
          label="Code Compose failed"
          message={getToolStatusErrorMessage(status) ?? "Execution failed"}
        />
      );
    } else if (status.type === "incomplete") {
      content = (
        <div className="my-1 flex items-start gap-2 rounded-md border border-border/50 bg-card/50 px-3 py-2 text-xs text-muted-foreground">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>Code Compose did not complete.</span>
        </div>
      );
    }

    return (
      <ToolUIErrorBoundary componentName="CodeCompose">
        {content}
      </ToolUIErrorBoundary>
    );
  },
});

export const renderCodeComposeToolUI: AssistantToolUIProps<
  CodeComposeArgs,
  CodeComposeResult
>["render"] = CodeComposeToolUIComponent.unstable_tool.render;
