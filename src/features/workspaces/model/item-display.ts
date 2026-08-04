import { Mic, Upload } from "lucide-react";

import { getWorkspaceObjectRegistryEntry } from "#/features/workspaces/model/object-registry";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import { workspaceColors } from "#/features/workspaces/model/workspace-colors";
import { resolveWorkspaceFileTypeFromItem } from "#/features/workspaces/model/workspace-file";
import { getWorkspaceItemPalette } from "#/features/workspaces/model/workspace-item-colors";

export function getWorkspaceItemDisplay(item: WorkspaceItem) {
	const typeDisplay = getWorkspaceObjectRegistryEntry(item.type);
	const palette = getWorkspaceItemPalette(item);
	const fileDescriptor = item.type === "file" ? resolveWorkspaceFileTypeFromItem(item) : null;

	return {
		...typeDisplay,
		label: fileDescriptor?.label ?? typeDisplay.label,
		Icon: fileDescriptor?.icon ?? typeDisplay.icon,
		iconClassName: palette.iconClassName,
		surfaceClassName: palette.surfaceClassName,
	};
}

const workspaceItemPrimaryCreateActionOrder = ["document", "folder"] as const;
const workspaceItemLearnCreateActionOrder = ["flashcard", "quiz"] as const;

export const workspaceItemPrimaryCreateActions =
	workspaceItemPrimaryCreateActionOrder.map(createWorkspaceItemAction);

export const workspaceItemLearnCreateActions =
	workspaceItemLearnCreateActionOrder.map(createWorkspaceItemAction);

function createWorkspaceItemAction(type: "document" | "folder" | "flashcard" | "quiz") {
	const display = getWorkspaceObjectRegistryEntry(type);
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
		iconClassName: workspaceColors[getWorkspaceObjectRegistryEntry("file").color].iconClassName,
		disabled: false,
	},
	{
		id: "record-audio",
		label: "Record",
		description: "Soon",
		Icon: Mic,
		iconClassName: workspaceColors.orange.iconClassName,
		disabled: true,
	},
] as const;
