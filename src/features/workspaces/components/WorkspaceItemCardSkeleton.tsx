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
			<div className={workspaceItemPreviewStageClass}>
				<Skeleton className="size-full rounded-none bg-muted/45" />
			</div>

			<div className={workspaceItemPreviewControlsLayerClass}>
				<div className={workspaceItemPreviewControlRowClass}>
					<Skeleton className={cn(workspaceItemPreviewControlSizeClass, "bg-muted/55")} />
					{/* Mirrors the real row's spacer: the two controls split to opposite
					    ends on desktop and sit together at the right edge on mobile. */}
					<div aria-hidden="true" className="hidden h-full flex-1 sm:block" />
					<Skeleton className={cn(workspaceItemPreviewControlSizeClass, "bg-muted/55")} />
				</div>
			</div>

			<CardHeader className={workspaceItemCardHeaderClass}>
				{/* Heights track the real type: CardTitle is text-base/leading-normal
				    and WorkspaceCardMetaRow is text-xs. */}
				<Skeleton className="h-6 w-3/5 rounded-sm bg-muted/55" />
				<div className="flex items-center gap-2">
					<Skeleton className="h-4 w-1/3 rounded-sm bg-muted/45" />
					<Skeleton className="ml-auto h-4 w-1/4 rounded-sm bg-muted/45" />
				</div>
			</CardHeader>
		</Card>
	);
}
