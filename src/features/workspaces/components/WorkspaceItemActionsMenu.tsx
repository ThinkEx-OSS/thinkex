import { EllipsisVertical, FolderInput, Palette, Pencil, Trash2 } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { ColorSwatchPicker } from "#/components/ui/color-swatch-picker";
import {
	ContextMenuContent,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "#/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
	workspaceContextMenuRenderer,
	workspaceDropdownMenuRenderer,
} from "#/features/workspaces/components/WorkspaceMenuRenderers";
import { WorkspaceToolbarIconButton } from "#/features/workspaces/components/WorkspaceToolbar";
import type { WorkspaceMenuRenderer } from "#/features/workspaces/components/workspace-menu-actions";
import { workspaceMenuItemInteraction } from "#/features/workspaces/components/workspace-menu-actions";
import { useWorkspaceMutationAccess } from "#/features/workspaces/components/workspace-mutation-access";
import { WorkspaceViewerMenuNotice } from "#/features/workspaces/components/workspace-viewer-ui";
import type { WorkspaceItemColor } from "#/features/workspaces/contracts";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import {
	getWorkspaceItemColorValue,
	workspaceItemColorOptions,
	workspaceItemSupportsCustomColor,
} from "#/features/workspaces/model/workspace-item-colors";
import { useUpdateWorkspaceItemColorMutation } from "#/features/workspaces/use-workspace-kernel-items";

const workspaceItemColorSubmenuTrigger = (
	<>
		<Palette className="size-4" />
		<span>Change color</span>
	</>
);

interface WorkspaceItemActionsMenuProps {
	item: WorkspaceItem;
	trigger?: ReactElement;
	triggerChildren?: ReactNode;
	align?: "start" | "center" | "end";
	onMoveItem: (item: WorkspaceItem) => void;
	onRenameItem: (item: WorkspaceItem) => void;
	onDeleteItem: (item: WorkspaceItem) => void;
}

export default function WorkspaceItemActionsMenu({
	item,
	trigger,
	triggerChildren,
	align = "end",
	onMoveItem,
	onRenameItem,
	onDeleteItem,
}: WorkspaceItemActionsMenuProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					trigger ?? <WorkspaceToolbarIconButton aria-label={`Open actions for ${item.name}`} />
				}
			>
				{triggerChildren ?? (trigger ? null : <EllipsisVertical />)}
			</DropdownMenuTrigger>
			<DropdownMenuContent align={align} className="w-52">
				<WorkspaceItemActionsMenuContent
					item={item}
					onMoveItem={onMoveItem}
					onRenameItem={onRenameItem}
					onDeleteItem={onDeleteItem}
				/>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function WorkspaceItemActionsMenuContent({
	item,
	onMoveItem,
	onRenameItem,
	onDeleteItem,
	renderer = workspaceDropdownMenuRenderer,
	menuKind = "dropdown",
}: {
	item: WorkspaceItem;
	onMoveItem: (item: WorkspaceItem) => void;
	onRenameItem: (item: WorkspaceItem) => void;
	onDeleteItem: (item: WorkspaceItem) => void;
	renderer?: WorkspaceMenuRenderer;
	menuKind?: "dropdown" | "context";
}) {
	const { capabilities } = useWorkspaceMutationAccess();
	const updateWorkspaceItemColorMutation = useUpdateWorkspaceItemColorMutation();
	const readOnly = !capabilities.canMutateContent;

	return (
		<>
			{readOnly ? <WorkspaceViewerMenuNotice menuKind={menuKind} /> : null}
			<WorkspaceItemRenameMenuItem
				item={item}
				readOnly={readOnly}
				renderer={renderer}
				onRenameItem={onRenameItem}
			/>
			{workspaceItemSupportsCustomColor(item.type) ? (
				<WorkspaceItemColorSubmenu
					item={item}
					menuKind={menuKind}
					readOnly={readOnly}
					onUpdateItemColor={(color) =>
						updateWorkspaceItemColorMutation.mutate({
							workspaceId: item.workspaceId,
							itemId: item.id,
							color,
						})
					}
				/>
			) : null}
			<WorkspaceItemMoveMenuItem
				item={item}
				readOnly={readOnly}
				renderer={renderer}
				onMoveItem={onMoveItem}
			/>
			{renderer.separator("danger-separator")}
			<WorkspaceItemDeleteMenuItem
				item={item}
				readOnly={readOnly}
				renderer={renderer}
				onDeleteItem={onDeleteItem}
			/>
		</>
	);
}

export function WorkspaceItemActionsContextMenuContent({
	item,
	onMoveItem,
	onRenameItem,
	onDeleteItem,
}: {
	item: WorkspaceItem;
	onMoveItem: (item: WorkspaceItem) => void;
	onRenameItem: (item: WorkspaceItem) => void;
	onDeleteItem: (item: WorkspaceItem) => void;
}) {
	return (
		<ContextMenuContent className="w-52">
			<WorkspaceItemActionsMenuContent
				item={item}
				onMoveItem={onMoveItem}
				onRenameItem={onRenameItem}
				onDeleteItem={onDeleteItem}
				renderer={workspaceContextMenuRenderer}
				menuKind="context"
			/>
		</ContextMenuContent>
	);
}

function WorkspaceItemRenameMenuItem({
	item,
	readOnly,
	renderer,
	onRenameItem,
}: {
	item: WorkspaceItem;
	readOnly: boolean;
	renderer: WorkspaceMenuRenderer;
	onRenameItem: (item: WorkspaceItem) => void;
}) {
	const interaction = workspaceMenuItemInteraction(readOnly, () => onRenameItem(item));

	return renderer.item({
		id: "rename",
		...interaction,
		children: (
			<>
				<Pencil className="size-4" />
				<span>Rename</span>
			</>
		),
	});
}

function WorkspaceItemColorSubmenu({
	item,
	menuKind,
	readOnly,
	onUpdateItemColor,
}: {
	item: WorkspaceItem;
	menuKind: "dropdown" | "context";
	readOnly: boolean;
	onUpdateItemColor: (color: WorkspaceItemColor) => void;
}) {
	const selectedColor = getWorkspaceItemColorValue(item.color);
	const content = (
		<ColorSwatchPicker
			aria-label={`Color for ${item.name}`}
			value={selectedColor}
			options={workspaceItemColorOptions}
			onValueChange={onUpdateItemColor}
			showLabels={false}
			className="grid-flow-col grid-rows-4 gap-1.5"
			disabled={readOnly}
		/>
	);

	if (menuKind === "context") {
		return (
			<ContextMenuSub>
				<ContextMenuSubTrigger disabled={readOnly}>
					{workspaceItemColorSubmenuTrigger}
				</ContextMenuSubTrigger>
				<ContextMenuSubContent className="max-w-[calc(100vw-2rem)] w-fit overflow-x-auto p-2">
					{content}
				</ContextMenuSubContent>
			</ContextMenuSub>
		);
	}

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger disabled={readOnly}>
				{workspaceItemColorSubmenuTrigger}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="max-w-[calc(100vw-2rem)] w-fit overflow-x-auto p-2">
				{content}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

function WorkspaceItemMoveMenuItem({
	item,
	readOnly,
	renderer,
	onMoveItem,
}: {
	item: WorkspaceItem;
	readOnly: boolean;
	renderer: WorkspaceMenuRenderer;
	onMoveItem: (item: WorkspaceItem) => void;
}) {
	const interaction = workspaceMenuItemInteraction(readOnly, () => onMoveItem(item));

	return renderer.item({
		id: "move",
		...interaction,
		children: (
			<>
				<FolderInput className="size-4" />
				<span>Move</span>
			</>
		),
	});
}

function WorkspaceItemDeleteMenuItem({
	item,
	readOnly,
	renderer,
	onDeleteItem,
}: {
	item: WorkspaceItem;
	readOnly: boolean;
	renderer: WorkspaceMenuRenderer;
	onDeleteItem: (item: WorkspaceItem) => void;
}) {
	const interaction = workspaceMenuItemInteraction(readOnly, () => onDeleteItem(item));

	return renderer.item({
		id: "delete",
		variant: "destructive",
		...interaction,
		children: (
			<>
				<Trash2 className="size-4" />
				<span>Delete</span>
			</>
		),
	});
}
