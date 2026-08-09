import { Skeleton } from "#/components/ui/skeleton";

export default function WorkspaceCardSkeleton() {
	return (
		<div className="relative block overflow-hidden rounded-xl bg-card shadow-xs">
			<Skeleton className="aspect-[5/2] w-full rounded-none bg-muted/45" />
			<Skeleton className="absolute top-2 right-2 size-8 rounded-md bg-muted/55" />
			<div className="min-w-0 flex-1 space-y-2 px-3 py-2.5 sm:px-4 sm:py-3">
				<Skeleton className="h-5 w-3/4 rounded-sm bg-muted/55" />
				<div className="flex items-center justify-between gap-2">
					<Skeleton className="h-3 w-1/4 rounded-sm bg-muted/45" />
					<Skeleton className="h-3 w-1/3 rounded-sm bg-muted/45" />
				</div>
			</div>
		</div>
	);
}
