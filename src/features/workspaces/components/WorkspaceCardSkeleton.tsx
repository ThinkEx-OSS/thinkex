import { Card, CardHeader } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { workspaceToolbarButtonSizeClass } from "#/features/workspaces/components/workspace-toolbar-styles";
import { cn } from "#/lib/utils";

/**
 * Loading placeholder for WorkspaceCard: the 5:2 theme band over a name and
 * meta row, one layout at every breakpoint. Uses the real Card so the surface,
 * ring and radius come from the same place the card gets them.
 */
export default function WorkspaceCardSkeleton() {
	return (
		<Card className="relative gap-0 py-0">
			<Skeleton className="aspect-[5/2] w-full rounded-none bg-muted/45" />

			{/* The settings button, which is always mounted on mobile. */}
			<Skeleton
				className={cn(
					workspaceToolbarButtonSizeClass,
					"absolute top-2 right-2 rounded-md bg-muted/55 sm:hidden",
				)}
			/>

			<CardHeader className="min-w-0 flex-1 gap-1 px-3 py-2.5 sm:gap-2 sm:px-4 sm:py-3">
				{/* Heights track the real type: CardTitle is text-base/leading-normal
				    and WorkspaceCardMetaRow is text-xs. */}
				<Skeleton className="h-6 w-3/4 rounded-sm bg-muted/55" />
				<div className="flex items-center justify-between gap-2">
					<Skeleton className="h-4 w-1/4 rounded-sm bg-muted/45" />
					<Skeleton className="h-4 w-1/3 rounded-sm bg-muted/45" />
				</div>
			</CardHeader>
		</Card>
	);
}
