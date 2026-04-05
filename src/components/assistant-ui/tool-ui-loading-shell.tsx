"use client";

import { useMemo } from "react";
import { useToolArgsStatus } from "@assistant-ui/react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ShinyText from "@/components/ShinyText";

export interface ToolUILoadingShellProps {
  /** Main label shown next to the spinner (e.g. "Creating document...") */
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
  const { propStatus } = useToolArgsStatus<Record<string, unknown>>();

  const resolvedSubtitle = useMemo(() => {
    if (subtitle) return subtitle;

    const fieldStatuses = Object.values(propStatus);
    if (fieldStatuses.includes("streaming")) {
      return "Preparing request...";
    }

    if (fieldStatuses.includes("complete")) {
      return "Working...";
    }

    return undefined;
  }, [propStatus, subtitle]);

  return (
    <div
      className={cn(
        "my-1 flex w-full items-center justify-between overflow-hidden rounded-md border border-border/50 bg-card/50 text-card-foreground shadow-sm px-2 py-2",
        className
      )}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="flex size-4 items-center justify-center text-blue-400">
          <Loader2 className="size-4 animate-spin" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-xs font-medium truncate">
            <ShinyText
              text={label}
              disabled={false}
              speed={1.5}
              className="font-medium"
            />
          </span>
          {resolvedSubtitle && (
            <span className="text-[10px] text-muted-foreground">
              {resolvedSubtitle}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
