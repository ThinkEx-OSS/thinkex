import { FilePen, Folder, Layers3, Paperclip, Upload } from "lucide-react";

import {
	type WorkspaceItem,
	type WorkspaceItemType,
	getWorkspaceItemContentKind,
	getWorkspaceItemRegistryEntry,
} from "#/features/workspaces/contracts";
import { workspaceColors } from "#/features/workspaces/model/workspace-colors";
import { resolveWorkspaceFileTypeFromItem } from "#/features/workspaces/model/workspace-file";
import { getWorkspaceItemPalette } from "#/features/workspaces/model/workspace-item-colors";

const workspaceItemIcons = {
	document: FilePen,
	file: Paperclip,
	flashcard: Layers3,
	folder: Folder,
} satisfies Record<WorkspaceItemType, typeof FilePen>;

/**
 * The registry entry plus everything that only the client can supply. Kept out
 * of the registry itself so server code can read item metadata without pulling
 * an icon set into the Worker bundle.
 */
export function getWorkspaceItemTypeDisplay(type: WorkspaceItemType) {
	return {
		...getWorkspaceItemRegistryEntry(type),
		icon: workspaceItemIcons[type],
		type,
	};
}

export function getWorkspaceItemDisplay(item: WorkspaceItem) {
	const typeDisplay = getWorkspaceItemTypeDisplay(item.type);
	const palette = getWorkspaceItemPalette(item);
	const fileDescriptor =
		getWorkspaceItemContentKind(item.type) === "file"
			? resolveWorkspaceFileTypeFromItem(item)
			: null;

	return {
		...typeDisplay,
		label: fileDescriptor?.label ?? typeDisplay.label,
		Icon: fileDescriptor?.icon ?? typeDisplay.icon,
		iconClassName: palette.iconClassName,
		surfaceClassName: palette.surfaceClassName,
	};
}

const workspaceItemPrimaryCreateActionOrder = ["document", "flashcard", "folder"] as const;

export const workspaceItemPrimaryCreateActions =
	workspaceItemPrimaryCreateActionOrder.map(createWorkspaceItemAction);

function createWorkspaceItemAction(type: "document" | "flashcard" | "folder") {
	const display = getWorkspaceItemTypeDisplay(type);
	return {
		type,
		label: display.menuLabel,
		Icon: display.icon,
		iconClassName: workspaceColors[display.color].iconClassName,
	};
}

export const workspaceItemAcquisitionActions = [
	{
		id: "upload-file",
		label: "Upload",
		description: undefined,
		Icon: Upload,
		iconClassName: workspaceColors[getWorkspaceItemTypeDisplay("file").color].iconClassName,
		disabled: false,
	},
] as const;
