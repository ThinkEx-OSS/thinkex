import WorkspaceItemPreviewSurface from "#/features/workspaces/components/WorkspaceItemPreviewSurface";
import { workspaceItemPreviewStageClass } from "#/features/workspaces/components/workspace-item-card-chrome";
import { getWorkspaceItemDisplay } from "#/features/workspaces/model/item-display";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import { cn } from "#/lib/utils";

interface WorkspaceItemCardPreviewStageProps {
	item: WorkspaceItem;
}

export function WorkspaceItemCardPreviewStage({ item }: WorkspaceItemCardPreviewStageProps) {
	const { surfaceClassName } = getWorkspaceItemDisplay(item);

	return (
		<div className={cn(workspaceItemPreviewStageClass, surfaceClassName)}>
			<WorkspaceItemPreviewSurface item={item} />
		</div>
	);
}
