import { Card, CardHeader } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import {
	workspaceItemCardHeaderClass,
	workspaceItemCardShapeClass,
	workspaceItemPreviewControlRowClass,
	workspaceItemPreviewControlSizeClass,
	workspaceItemPreviewControlsLayerClass,
	workspaceItemPreviewStageClass,
} from "#/features/workspaces/components/workspace-item-card-chrome";
import { cn } from "#/lib/utils";

/**
 * Loading placeholder for WorkspaceItemCard. Item cards are a row on mobile and
 * a column on desktop with a flexible-height preview, which is nothing like a
 * workspace card's fixed 5:2 band — the two used to share one skeleton and the
 * item grid settled about 30px shorter than it drew. Built from the same chrome
 * tokens the real card uses so the box can't drift again.
 */
export default function WorkspaceItemCardSkeleton() {
	return (
		<Card className={workspaceItemCardShapeClass}>
			{/* The stage's own bg-muted is dropped: stacking the field on top of it
			    reads as a solid block rather than a placeholder. */}
			<div className={cn(workspaceItemPreviewStageClass, "bg-transparent")}>
				<Skeleton className="size-full rounded-none bg-muted/45" />
			</div>

			{/* Mobile only, because the real controls are hover-revealed from sm up
			    (workspaceItemPreviewControlOverlayClass) and drawing them here would
			    promise two buttons that vanish once the card loads. */}
			<div className={cn(workspaceItemPreviewControlsLayerClass, "sm:hidden")}>
				<div className={workspaceItemPreviewControlRowClass}>
					<Skeleton className={cn(workspaceItemPreviewControlSizeClass, "bg-muted/55")} />
					<Skeleton className={cn(workspaceItemPreviewControlSizeClass, "bg-muted/55")} />
				</div>
			</div>

			<CardHeader className={workspaceItemCardHeaderClass}>
				{/* Heights track the real type: CardTitle is text-base/leading-normal
				    and WorkspaceCardMetaRow is text-xs. Same proportions as the
				    workspace card's skeleton so the two read as one family. */}
				<Skeleton className="h-6 w-3/4 rounded-sm bg-muted/55" />
				<div className="flex items-center justify-between gap-2">
					<Skeleton className="h-4 w-1/4 rounded-sm bg-muted/45" />
					<Skeleton className="h-4 w-1/3 rounded-sm bg-muted/45" />
				</div>
			</CardHeader>
		</Card>
	);
}
