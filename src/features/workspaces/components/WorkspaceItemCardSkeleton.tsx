import { Card } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import {
	workspaceItemCardHeaderClass,
	workspaceItemCardShapeClass,
	workspaceItemPreviewControlRowClass,
	workspaceItemPreviewControlSizeClass,
	workspaceItemPreviewControlsLayerClass,
	workspaceItemPreviewStageClass,
} from "#/features/workspaces/components/workspace-item-card-chrome";
import {
	WorkspaceCardSkeletonHeader,
	workspaceSkeletonAccentClass,
	workspaceSkeletonFieldClass,
} from "#/features/workspaces/components/workspace-skeleton-chrome";
import { cn } from "#/lib/utils";

/**
 * Loading placeholder for WorkspaceItemCard — a row on mobile, a column with a
 * flexible-height preview on desktop. Built from the same chrome tokens as the
 * real card; it previously borrowed the workspace card's skeleton and settled
 * about 30px short of the card it stood in for.
 */
export default function WorkspaceItemCardSkeleton() {
	return (
		<Card className={workspaceItemCardShapeClass}>
			{/* The stage's own bg-muted is dropped: under the field it stacks into a
			    solid block rather than a placeholder. */}
			<div className={cn(workspaceItemPreviewStageClass, "bg-transparent")}>
				<Skeleton className={cn("size-full rounded-none", workspaceSkeletonFieldClass)} />
			</div>

			{/* Mobile only: from sm up the real controls are hover-revealed, so
			    drawing them would promise buttons that vanish on load. */}
			<div className={cn(workspaceItemPreviewControlsLayerClass, "sm:hidden")}>
				<div className={workspaceItemPreviewControlRowClass}>
					<Skeleton
						className={cn(workspaceItemPreviewControlSizeClass, workspaceSkeletonAccentClass)}
					/>
					<Skeleton
						className={cn(workspaceItemPreviewControlSizeClass, workspaceSkeletonAccentClass)}
					/>
				</div>
			</div>

			<WorkspaceCardSkeletonHeader className={workspaceItemCardHeaderClass} />
		</Card>
	);
}
