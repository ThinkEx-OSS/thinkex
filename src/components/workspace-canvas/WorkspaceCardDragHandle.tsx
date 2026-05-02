"use client";

import { forwardRef } from "react";
import { GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkspaceCardDragHandleProps {
  label: string;
  className?: string;
}

export const WorkspaceCardDragHandle = forwardRef<
  HTMLButtonElement,
  WorkspaceCardDragHandleProps
>(function WorkspaceCardDragHandle({ label, className }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      data-drag-handle
      className={cn(
        "absolute bottom-2 left-1/2 z-30 inline-flex h-6 w-10 -translate-x-1/2 items-center justify-center rounded-full text-muted-foreground/55 transition-all duration-200 hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100",
        className,
      )}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <GripHorizontal className="h-4 w-4" />
    </button>
  );
});
