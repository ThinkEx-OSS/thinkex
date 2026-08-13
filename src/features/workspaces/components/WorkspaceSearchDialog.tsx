import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandFooter,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	useCommandSearch,
} from "#/components/ui/command";
import type { WorkspaceItem } from "#/features/workspaces/contracts";
import { getWorkspaceItemDisplay } from "#/features/workspaces/model/item-display";
import { getWorkspaceItemParentPath } from "#/features/workspaces/model/tree";
import { rankNameSearch, type NameSearchField } from "#/lib/name-search";
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
			<Command key={open ? "open" : "closed"}>
				<CommandInput autoFocus placeholder="Search workspace..." />
				<WorkspaceSearchResults activeItem={activeItem} items={items} onSelect={selectItem} />
				<CommandFooter />
			</Command>
		</CommandDialog>
	);
}

function WorkspaceSearchResults({
	activeItem,
	items,
	onSelect,
}: {
	activeItem?: WorkspaceItem;
	items: readonly WorkspaceItem[];
	onSelect: (item: WorkspaceItem) => void;
}) {
	const search = useCommandSearch();
	const itemsById = new Map(items.map((item) => [item.id, item]));
	const ranked = rankNameSearch(search, items, getWorkspaceSearchFields);

	return (
		<CommandList>
			<CommandEmpty>No workspace items found.</CommandEmpty>
			<CommandGroup>
				{ranked.map((item) => (
					<WorkspaceSearchResult
						key={item.id}
						item={item}
						path={getWorkspaceItemParentPath(item, itemsById)}
						active={item.id === activeItem?.id}
						onSelect={() => onSelect(item)}
					/>
				))}
			</CommandGroup>
		</CommandList>
	);
}

function getWorkspaceSearchFields(item: WorkspaceItem): readonly NameSearchField[] {
	const itemDisplay = getWorkspaceItemDisplay(item);
	return [item.name, itemDisplay.label, item.type];
}

function WorkspaceSearchResult({
	item,
	path,
	active,
	onSelect,
}: {
	item: WorkspaceItem;
	path: string | null;
	active: boolean;
	onSelect: () => void;
}) {
	const itemDisplay = getWorkspaceItemDisplay(item);
	const Icon = itemDisplay.Icon;

	return (
		<CommandItem
			value={item.id}
			data-checked={active}
			className="items-start gap-2 py-2"
			onSelect={onSelect}
		>
			<Icon
				className={cn("mt-0.5 size-4 shrink-0", itemDisplay.iconClassName)}
				aria-hidden="true"
			/>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate font-medium">{item.name}</span>
				{path ? (
					<span className="truncate text-xs text-muted-foreground" title={path}>
						{path}
					</span>
				) : null}
			</span>
		</CommandItem>
	);
}
