import { Upload } from "lucide-react";

import { getWorkspaceObjectRegistryEntry } from "#/features/workspaces/model/object-registry";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import { workspaceColors } from "#/features/workspaces/model/workspace-colors";
import { resolveWorkspaceFileTypeFromItem } from "#/features/workspaces/model/workspace-file";
import {
	getWorkspaceItemPalette,
	workspaceItemTypeColors,
} from "#/features/workspaces/model/workspace-item-colors";

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

export const workspaceItemPrimaryCreateActions = workspaceItemPrimaryCreateActionOrder.map(
	(type) => {
		const display = getWorkspaceObjectRegistryEntry(type);
		return {
			type,
			label: display.menuLabel,
			Icon: display.icon,
			iconClassName: workspaceColors[workspaceItemTypeColors[type]].iconClassName,
		};
	},
);

export const workspaceFileUploadAction = {
	id: "upload-file",
	label: "Upload",
	Icon: Upload,
	iconClassName: workspaceColors[workspaceItemTypeColors.file].iconClassName,
};
