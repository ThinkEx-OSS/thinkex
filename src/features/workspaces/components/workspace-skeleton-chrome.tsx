import { CardHeader } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { cn } from "#/lib/utils";

export function WorkspaceCardSkeletonHeader({ className }: { className?: string }) {
	return (
		// Empty percentage-width bars need an explicit grid track.
		<CardHeader className={cn("grid-cols-1 rounded-none bg-card", className)}>
			<Skeleton className="h-6 w-3/4 rounded-sm" />
			<div className="flex items-center justify-between gap-2">
				<Skeleton className="h-4 w-1/4 rounded-sm" />
				<Skeleton className="h-4 w-1/3 rounded-sm" />
			</div>
		</CardHeader>
	);
}
