"use client";

import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToolUIErrorShellProps {
  /** Main label (e.g. "Failed to create note") */
  label: string;
  /** Optional error message with more details */
  message?: string;
  className?: string;
}

/**
 * Shared error shell for assistant-ui tool UIs. Card-style layout with
 * error icon + label (+ optional message). Only show when status.type !== "running"
 * (e.g. incomplete + error, or complete + !success).
 */
export function ToolUIErrorShell({
  label,
  message,
  className,
}: ToolUIErrorShellProps) {
  return (
    <div
      className={cn(
        "my-1 flex w-full items-start gap-2 overflow-hidden rounded-md border border-destructive/30 bg-destructive/5 text-card-foreground px-2 py-2",
        className
      )}
    >
      <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-destructive">
        <AlertCircle className="size-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs font-medium text-destructive/90">{label}</span>
        {message && (
          <span className="text-xs text-muted-foreground">{message}</span>
        )}
      </div>
    </div>
  );
}
