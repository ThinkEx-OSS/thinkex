"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ShinyText from "@/components/ShinyText";

export interface ToolUILoadingShellProps {
  /** Main label shown next to the spinner (e.g. "Creating note...") */
  label: string;
  /** Optional secondary line (e.g. "Adding to context...") */
  subtitle?: string;
  className?: string;
}

/**
 * Shared loading shell for assistant-ui tool UIs. Card-style layout with
 * spinner + label (+ optional subtitle). Use when status.type === "running".
 */
export function ToolUILoadingShell({
  label,
  subtitle,
  className,
}: ToolUILoadingShellProps) {
  return (
    <div
      className={cn(
        "my-2 flex w-full flex-col overflow-hidden rounded-xl border bg-card/50 text-card-foreground shadow-sm",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
            <Loader2 className="size-4 animate-spin" />
          </div>
          <div className="flex flex-col">
            <ShinyText
              text={label}
              disabled={false}
              speed={1.5}
              className="text-sm font-semibold"
            />
            {subtitle && (
              <span className="text-xs text-muted-foreground">{subtitle}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
