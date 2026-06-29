import { type LucideIcon, Mic, Upload } from "lucide-react";

import {
	creatableWorkspaceObjectEntries,
	getWorkspaceObjectRegistryEntry,
} from "#/features/workspaces/model/object-registry";
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

export const workspaceItemCreateActions = creatableWorkspaceObjectEntries.map((display) => ({
	type: display.type,
	label: display.menuLabel,
	group: display.menuGroup,
	Icon: display.icon,
	iconClassName: workspaceColors[workspaceItemTypeColors[display.type]].iconClassName,
}));

const workspaceItemPrimaryCreateActionOrder = ["document", "folder"] as const;

export const workspaceItemPrimaryCreateActions = workspaceItemPrimaryCreateActionOrder.map(
	(type) => {
		const action = workspaceItemCreateActions.find((item) => item.type === type);

		if (!action) {
			throw new Error(`Missing workspace create action for type: ${type}`);
		}

		return action;
	},
);

export const workspaceItemLearnCreateActions = workspaceItemCreateActions.filter(
	(action) => action.group === "learn",
);

export interface WorkspaceItemAcquisitionAction {
	id: "upload-file" | "record-audio";
	label: string;
	description?: string;
	Icon: LucideIcon;
	iconClassName: string;
	disabled: boolean;
}

export const workspaceItemAcquisitionActions: WorkspaceItemAcquisitionAction[] = [
	{
		id: "upload-file",
		label: "Upload",
		Icon: Upload,
		iconClassName: workspaceColors[workspaceItemTypeColors.file].iconClassName,
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
];
