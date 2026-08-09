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
import { WorkspaceCardSkeletonHeader } from "#/features/workspaces/components/workspace-skeleton-chrome";
import { cn } from "#/lib/utils";

export default function WorkspaceItemCardSkeleton() {
	return (
		<Card className={cn(workspaceItemCardShapeClass, "bg-transparent")}>
			<div className={cn(workspaceItemPreviewStageClass, "bg-transparent")}>
				<Skeleton className="size-full rounded-none" />
			</div>

			{/* Real controls are hover-only above mobile. */}
			<div className={cn(workspaceItemPreviewControlsLayerClass, "sm:hidden")}>
				<div className={workspaceItemPreviewControlRowClass}>
					<Skeleton className={workspaceItemPreviewControlSizeClass} />
					<Skeleton className={workspaceItemPreviewControlSizeClass} />
				</div>
			</div>

			<WorkspaceCardSkeletonHeader className={workspaceItemCardHeaderClass} />
		</Card>
	);
}
