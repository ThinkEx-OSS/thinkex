import { FolderInput, Trash2, X } from "lucide-react";

import { Button } from "#/components/ui/button";
import { WorkspaceToolbarIconButton } from "#/features/workspaces/components/WorkspaceToolbar";
import { useWorkspaceMutationAccess } from "#/features/workspaces/components/workspace-mutation-access";

interface WorkspaceSelectionActionBarProps {
	selectedCount: number;
	onMove: () => void;
	onDelete: () => void;
	onClear: () => void;
}

export default function WorkspaceSelectionActionBar({
	selectedCount,
	onMove,
	onDelete,
	onClear,
}: WorkspaceSelectionActionBarProps) {
	const { capabilities } = useWorkspaceMutationAccess();
	const canMutateContent = capabilities.canMutateContent;

	if (selectedCount === 0 || !canMutateContent) {
		return null;
	}

	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
			<div className="pointer-events-auto flex w-fit max-w-full items-center gap-2 rounded-md border bg-popover/95 p-2 text-popover-foreground shadow-[0_14px_40px_rgba(15,23,42,0.18)] backdrop-blur">
				<div className="min-w-0 px-2.5 text-sm font-medium whitespace-nowrap">
					{selectedCount} selected
				</div>
				{canMutateContent ? (
					<>
						<Button type="button" size="default" variant="outline" onClick={onMove}>
							<FolderInput className="size-4" aria-hidden="true" />
							Move
						</Button>
						<Button type="button" size="default" variant="destructive" onClick={onDelete}>
							<Trash2 className="size-4" aria-hidden="true" />
							Delete
						</Button>
					</>
				) : null}
				<WorkspaceToolbarIconButton aria-label="Clear selection" onClick={onClear}>
					<X aria-hidden="true" />
				</WorkspaceToolbarIconButton>
			</div>
		</div>
	);
}
