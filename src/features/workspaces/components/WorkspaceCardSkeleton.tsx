import { Card } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { WorkspaceCardSkeletonHeader } from "#/features/workspaces/components/workspace-skeleton-chrome";
import { workspaceToolbarButtonSizeClass } from "#/features/workspaces/components/workspace-toolbar-styles";
import { cn } from "#/lib/utils";

/**
 * Loading placeholder for WorkspaceCard: the 5:2 theme band over a name and
 * meta row, one layout at every breakpoint. Renders through the real Card so
 * surface, ring and radius come from where the card gets them.
 */
export default function WorkspaceCardSkeleton() {
	return (
		<Card className="relative gap-0 py-0">
			<Skeleton className="aspect-[5/2] w-full rounded-none" />

			{/* Mobile only: from sm up the real settings button is hover-revealed,
			    so drawing it would promise a control that vanishes on load. */}
			<Skeleton
				className={cn(
					workspaceToolbarButtonSizeClass,
					"absolute top-2 right-2 rounded-[min(var(--radius-md),10px)] sm:hidden",
				)}
			/>

			<WorkspaceCardSkeletonHeader className="min-w-0 flex-1 gap-1 px-3 py-2.5 sm:gap-2 sm:px-4 sm:py-3" />
		</Card>
	);
}
