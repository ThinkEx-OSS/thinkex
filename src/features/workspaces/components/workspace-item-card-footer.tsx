import { WorkspaceCardMetaRow } from "#/features/workspaces/components/workspace-card-meta-row";
import { getWorkspaceItemRecencyLabel } from "#/features/workspaces/model/display";
import { getWorkspaceItemDisplay } from "#/features/workspaces/model/item-display";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import { cn } from "#/lib/utils";

interface WorkspaceItemCardFooterProps {
	item: WorkspaceItem;
}

export function WorkspaceItemCardFooter({ item }: WorkspaceItemCardFooterProps) {
	const { Icon, iconClassName, label } = getWorkspaceItemDisplay(item);

	return (
		<WorkspaceCardMetaRow
			leading={
				<span className="flex min-w-0 items-center gap-1.5">
					<Icon
						className={cn("size-3.5 shrink-0", iconClassName)}
						strokeWidth={1.75}
						aria-hidden="true"
					/>
					<span className="truncate">{label}</span>
				</span>
			}
			trailing={getWorkspaceItemRecencyLabel(item)}
		/>
	);
}
