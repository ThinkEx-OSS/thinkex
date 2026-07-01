import WorkspaceItemPreviewSurface from "#/features/workspaces/components/WorkspaceItemPreviewSurface";
import { workspaceItemPreviewStageClass } from "#/features/workspaces/components/workspace-item-card-chrome";
import { getWorkspaceItemDisplay } from "#/features/workspaces/model/item-display";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import { cn } from "#/lib/utils";

interface WorkspaceItemCardPreviewStageProps {
	enablePreviews: boolean;
	item: WorkspaceItem;
}

export function WorkspaceItemCardPreviewStage({
	enablePreviews,
	item,
}: WorkspaceItemCardPreviewStageProps) {
	const { surfaceClassName } = getWorkspaceItemDisplay(item);

	return (
		<div className={cn(workspaceItemPreviewStageClass, surfaceClassName)}>
			<WorkspaceItemPreviewSurface enablePreviews={enablePreviews} item={item} />
		</div>
	);
}
