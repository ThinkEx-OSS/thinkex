import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function WorkspaceGridSkeleton() {
    return (
        <div className="w-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Render 8 skeleton cards to fill the grid */}
                {[...Array(8)].map((_, i) => (
                    <div
                        key={i}
                        className={cn(
                            "relative rounded-md shadow-sm min-h-[180px] overflow-hidden",
                            "flex flex-col border border-border/40 bg-card/40"
                        )}
                    >
                        {/* Top section - content area placeholder */}
                        <div className="flex-1 p-3 flex items-center justify-center">
                            <Skeleton className="h-12 w-12 rounded-lg opacity-20" />
                        </div>

                        {/* Bottom section with title, date, menu */}
                        <div className="flex flex-col justify-end px-4 pb-3 pt-2 relative min-h-[70px]">
                            {/* Title */}
                            <Skeleton className="h-5 w-3/4 mb-2" />

                            {/* Date and Avatar Row */}
                            <div className="flex items-center justify-between mt-1">
                                <Skeleton className="h-3 w-20" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
