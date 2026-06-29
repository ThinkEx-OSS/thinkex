import { Search, X } from "lucide-react";

import { Kbd } from "#/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import WorkspaceCreateMenu from "#/features/workspaces/components/WorkspaceCreateMenu";
import {
	WorkspaceToolbarIconButton,
	WorkspaceToolbarTextButton,
} from "#/features/workspaces/components/WorkspaceToolbar";
import type { WorkspaceItemType } from "#/features/workspaces/contracts";
import type { WorkspaceItem } from "#/features/workspaces/model/types";

interface WorkspaceContextActionsProps {
	activeItem?: WorkspaceItem;
	createParentId: string | null;
	searchHotkey: string;
	onCreateItem: (input: { type: WorkspaceItemType; parentId: string | null }) => void;
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
	const showBrowseActions = !activeItem || activeItem.type === "folder";

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
