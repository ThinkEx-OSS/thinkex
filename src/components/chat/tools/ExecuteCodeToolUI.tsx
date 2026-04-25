"use client";

import { useState } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "lucide-react";
import type { ChatToolUIProps } from "@/lib/chat/tool-ui-types";

import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { ToolUILoadingShell } from "./tool-ui-loading-shell";
import {
  ImageFilename,
  ImagePreview,
  ImageRoot,
  ImageZoom,
} from "@/components/chat/parts/image";
import type { CodeExecuteResult } from "@/lib/ai/code-execute-shared";

function chartDataUrl(chart: { type: string; data: string }): string {
  return `data:${chart.type};base64,${chart.data}`;
}

function chartLabel(chartType: string, index: number): string {
  const n = index + 1;
  if (chartType === "image/png") return `Chart ${n}.png`;
  if (chartType === "image/jpeg") return `Chart ${n}.jpg`;
  if (chartType === "image/svg+xml") return `Chart ${n}.svg`;
  return `Chart ${n}`;
}

export const renderExecuteCodeToolUI: ChatToolUIProps<
  { code: string },
  CodeExecuteResult
>["render"] = ({ status, args, result }) => {
  return (
    <ToolUIErrorBoundary componentName="ExecuteCode">
      {status.type === "running" ? (
        <ToolUILoadingShell label="Calculating…" />
      ) : status.type === "incomplete" ? (
        <div className="my-1 rounded-md border border-border/50 bg-card/50 px-3 py-2 text-xs text-muted-foreground">
          Couldn&apos;t complete this step. Try again or rephrase your question.
        </div>
      ) : (
        <ExecuteCodeResult args={args} result={result} />
      )}
    </ToolUIErrorBoundary>
  );
};

function ExecuteCodeResult({
  args,
  result,
}: {
  args: { code: string };
  result: CodeExecuteResult | undefined;
}) {
  const [showCode, setShowCode] = useState(false);
  const hasError = result?.error === true;
  const hasCharts = Boolean(result?.charts?.length);

  return (
    <div className="my-1 space-y-2">
      <div className="overflow-hidden rounded-md border border-border/40 bg-muted/20">
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
          {hasError ? (
            <AlertTriangleIcon
              className="size-3.5 shrink-0 text-amber-500"
              aria-hidden
            />
          ) : (
            <CheckCircle2Icon
              className="size-3.5 shrink-0 text-muted-foreground/80"
              aria-hidden
            />
          )}
          <span>{hasError ? "Finished with errors" : "Done"}</span>
          {args?.code ? (
            <button
              type="button"
              onClick={() => setShowCode((value) => !value)}
              className="ml-auto flex items-center gap-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
            >
              <span className="text-[10px]">Show code</span>
              {showCode ? (
                <ChevronDownIcon className="size-3" />
              ) : (
                <ChevronRightIcon className="size-3" />
              )}
            </button>
          ) : null}
        </div>

        {showCode && args?.code ? (
          <div className="border-t border-border/30">
            <pre className="overflow-x-auto bg-muted/10 p-3 text-xs leading-relaxed">
              <code>{args.code}</code>
            </pre>
            {result?.steps?.map((step, index) =>
              step.output ? (
                <pre
                  key={index}
                  className="overflow-x-auto border-t border-border/20 bg-muted/5 p-3 text-xs leading-relaxed text-muted-foreground"
                >
                  {step.output}
                </pre>
              ) : null,
            )}
          </div>
        ) : null}
      </div>

      {hasCharts ? (
        <div className="flex flex-wrap gap-2">
          {result?.charts?.map((chart, index) => {
            const src = chartDataUrl(chart);
            const label = chartLabel(chart.type, index);
            return (
              <div key={index} className="min-w-0 max-w-full">
                <ImageRoot>
                  <ImageZoom src={src} alt={label}>
                    <ImagePreview src={src} alt={label} />
                  </ImageZoom>
                  <ImageFilename>{label}</ImageFilename>
                </ImageRoot>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
