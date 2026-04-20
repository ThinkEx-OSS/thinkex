"use client";

import type { FC } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export const ThreadLoadingSkeleton: FC = () => {
  return (
    <div
      role="status"
      aria-label="Loading chat"
      className="aui-thread-loading-skeleton mx-auto flex w-full max-w-[var(--thread-max-width)] flex-col gap-6 px-2 py-8"
    >
      <div className="flex justify-end">
        <div className="max-w-[85%] space-y-2">
          <Skeleton className="h-12 w-48 rounded-lg" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full max-w-[90%] rounded" />
        <Skeleton className="h-4 w-full max-w-[70%] rounded" />
        <Skeleton className="h-4 w-32 rounded" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-10 w-64 rounded-lg" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full max-w-[95%] rounded" />
        <Skeleton className="h-4 w-full max-w-[80%] rounded" />
        <Skeleton className="h-4 w-full max-w-[60%] rounded" />
        <Skeleton className="h-4 w-24 rounded" />
      </div>
    </div>
  );
};
