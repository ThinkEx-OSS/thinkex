"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ShinyText from "@/components/ShinyText";

export interface ToolUILoadingShellProps {
  /** Main label shown next to the spinner (e.g. "Creating document...") */
  label: string;
  className?: string;
}

/**
 * Shared loading shell for assistant-ui tool UIs. Card-style layout with
 * spinner + label. Use when status.type === "running".
 */
export function ToolUILoadingShell({
  label,
  className,
}: ToolUILoadingShellProps) {
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
        <span className="text-xs font-medium truncate min-w-0">
          <ShinyText
            text={label}
            disabled={false}
            speed={1.5}
            className="font-medium"
          />
        </span>
      </div>
    </div>
  );
}
