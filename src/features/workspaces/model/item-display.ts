import { FilePen, Folder, Layers3, ListChecks, Mic, Paperclip, Upload } from "lucide-react";

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
	quiz: ListChecks,
	recording: Mic,
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

function createWorkspaceItemAction(type: "document" | "flashcard" | "folder" | "quiz") {
	const display = getWorkspaceItemTypeDisplay(type);
	return {
		kind: "item" as const,
		type,
		label: display.menuLabel,
		Icon: display.icon,
		iconClassName: workspaceColors[display.color].iconClassName,
	};
}

const workspaceUploadAction = {
	kind: "upload" as const,
	id: "upload-file",
	label: "Upload",
	Icon: Upload,
	iconClassName: workspaceColors[getWorkspaceItemTypeDisplay("file").color].iconClassName,
};

const workspaceRecordingAction = {
	kind: "recording" as const,
	id: "record",
	label: getWorkspaceItemTypeDisplay("recording").menuLabel,
	Icon: getWorkspaceItemTypeDisplay("recording").icon,
	iconClassName: workspaceColors[getWorkspaceItemTypeDisplay("recording").color].iconClassName,
};

export const workspaceCreateMenuActionGroups = [
	{
		id: "primary",
		actions: [
			createWorkspaceItemAction("document"),
			workspaceUploadAction,
			createWorkspaceItemAction("folder"),
			workspaceRecordingAction,
		],
	},
	{
		id: "study",
		actions: [createWorkspaceItemAction("flashcard"), createWorkspaceItemAction("quiz")],
	},
] as const;
