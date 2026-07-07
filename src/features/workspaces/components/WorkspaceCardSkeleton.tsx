import { Skeleton } from "#/components/ui/skeleton";

export default function WorkspaceCardSkeleton() {
	return (
		<div className="relative flex overflow-hidden rounded-xl bg-muted/35 shadow-none sm:block sm:bg-card sm:shadow-xs dark:bg-muted/20">
			<Skeleton className="size-14 shrink-0 rounded-none bg-muted/45 sm:aspect-[5/2] sm:size-auto sm:w-full" />
			<Skeleton className="absolute top-1/2 right-2 size-8 -translate-y-1/2 rounded-md bg-muted/55 sm:top-2 sm:translate-y-0" />
			<div className="min-w-0 flex-1 space-y-2 px-3 py-2.5 pr-12 sm:px-4 sm:py-3 sm:pr-4">
				<Skeleton className="h-5 w-3/4 rounded-sm bg-muted/55" />
				<div className="flex items-center justify-between gap-2">
					<Skeleton className="h-3 w-1/4 rounded-sm bg-muted/45" />
					<Skeleton className="h-3 w-1/3 rounded-sm bg-muted/45" />
				</div>
			</div>
		</div>
	);
}
