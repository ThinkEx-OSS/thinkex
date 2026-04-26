"use client";

import type React from "react";
import { cn } from "@/lib/utils";

export function EmptyState(props: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center w-full min-w-0 max-w-full",
      props.className
    )}>
      {props.children}
    </div>
  );
}




