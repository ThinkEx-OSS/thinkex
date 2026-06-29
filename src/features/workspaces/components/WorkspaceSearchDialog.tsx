import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "#/components/ui/command";
import { getWorkspaceItemDisplay } from "#/features/workspaces/model/item-display";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import { cn } from "#/lib/utils";

interface WorkspaceSearchDialogProps {
	open: boolean;
	activeItem?: WorkspaceItem;
	items: readonly WorkspaceItem[];
	onOpenChange: (open: boolean) => void;
	onOpenItem: (item: WorkspaceItem) => void;
}

export function WorkspaceSearchDialog({
	open,
	activeItem,
	items,
	onOpenChange,
	onOpenItem,
}: WorkspaceSearchDialogProps) {
	const selectItem = (item: WorkspaceItem) => {
		onOpenItem(item);

		onOpenChange(false);
	};

	return (
		<CommandDialog
			open={open}
			title="Search workspace"
			description="Search for a workspace item to open."
			className="sm:max-w-xl"
			onOpenChange={onOpenChange}
		>
			<Command>
				<CommandInput autoFocus placeholder="Search workspace..." />
				<CommandList>
					<CommandEmpty>No workspace items found.</CommandEmpty>
					<CommandGroup>
						{items.map((item) => (
							<WorkspaceSearchResult
								key={item.id}
								item={item}
								active={item.id === activeItem?.id}
								onSelect={() => selectItem(item)}
							/>
						))}
					</CommandGroup>
				</CommandList>
			</Command>
		</CommandDialog>
	);
}

function WorkspaceSearchResult({
	item,
	active,
	onSelect,
}: {
	item: WorkspaceItem;
	active: boolean;
	onSelect: () => void;
}) {
	const itemDisplay = getWorkspaceItemDisplay(item);
	const Icon = itemDisplay.Icon;

	return (
		<CommandItem value={item.name} data-checked={active} className="gap-2 py-2" onSelect={onSelect}>
			<Icon className={cn("size-4 shrink-0", itemDisplay.iconClassName)} aria-hidden="true" />
			<span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
		</CommandItem>
	);
}
