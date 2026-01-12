import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton loading state for workspace content
 * Shows placeholder cards while workspace data is loading
 */
export function WorkspaceSkeleton() {
  return (
    <div className="w-full h-full flex flex-col">
      {/* Header skeleton */}
      <div className="relative py-2 z-20 border-b border-sidebar-border bg-sidebar">
        <div className="flex items-center justify-between w-full px-3 gap-2">
          {/* Left: Save indicator */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-20" />
          </div>
          
          {/* Center: Search and Filter */}
          <div className="flex items-center gap-2 flex-1 justify-center max-w-2xl mx-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
      </div>

      {/* Cards grid skeleton */}
      <div className="flex-1 p-4 overflow-auto">
        <div className="grid grid-cols-2 gap-4">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="relative rounded-lg border border-border/40 bg-card p-4 space-y-3"
            >
              {/* Card header */}
              <div className="flex items-start justify-between">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-5 w-5 rounded" />
              </div>

              {/* Card content */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </div>

              {/* Card footer */}
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

