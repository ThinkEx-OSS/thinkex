import { Search, X } from "lucide-react";

import { Kbd } from "#/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import WorkspaceCreateMenu from "#/features/workspaces/components/WorkspaceCreateMenu";
import {
	WorkspaceToolbarIconButton,
	WorkspaceToolbarTextButton,
} from "#/features/workspaces/components/WorkspaceToolbar";
import type { WorkspaceCreateItemRequest } from "#/features/workspaces/components/workspace-presentation-model";
import { type WorkspaceItem, isWorkspaceItemContainer } from "#/features/workspaces/contracts";

interface WorkspaceContextActionsProps {
	activeItem?: WorkspaceItem;
	createParentId: string | null;
	searchHotkey: string;
	onCreateItem: (input: WorkspaceCreateItemRequest) => void;
	onSearch: () => void;
	onCloseItemView?: () => void;
}

export default function WorkspaceContextActions({
	activeItem,
	createParentId,
	searchHotkey,
	onCreateItem,
	onSearch,
	onCloseItemView,
}: WorkspaceContextActionsProps) {
	const showBrowseActions = !activeItem || isWorkspaceItemContainer(activeItem.type);

	return (
		<>
			{showBrowseActions ? (
				<>
					<WorkspaceSearchAction hotkey={searchHotkey} onSearch={onSearch} />
					<WorkspaceCreateMenu parentId={createParentId} onCreateItem={onCreateItem} />
				</>
			) : null}
			{onCloseItemView ? (
				<WorkspaceToolbarIconButton aria-label="Close item" onClick={onCloseItemView}>
					<X />
				</WorkspaceToolbarIconButton>
			) : null}
		</>
	);
}

function WorkspaceSearchAction({ hotkey, onSearch }: { hotkey: string; onSearch: () => void }) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<WorkspaceToolbarTextButton onClick={onSearch}>
						<Search />
						<span className="hidden sm:inline">Search</span>
					</WorkspaceToolbarTextButton>
				}
			/>
			<TooltipContent>
				<span>Search</span>
				<Kbd>{hotkey}</Kbd>
			</TooltipContent>
		</Tooltip>
	);
}
