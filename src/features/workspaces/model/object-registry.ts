import { FilePen, Folder, type LucideIcon, Paperclip } from "lucide-react";

import type { WorkspaceItemType } from "#/features/workspaces/contracts";
interface WorkspaceItemRegistryEntry {
	type: WorkspaceItemType;
	label: string;
	menuLabel: string;
	icon: LucideIcon;
}

export const workspaceObjectRegistry = {
	folder: {
		type: "folder",
		label: "Folder",
		menuLabel: "Folder",
		icon: Folder,
	},
	document: {
		type: "document",
		label: "Document",
		menuLabel: "Document",
		icon: FilePen,
	},
	file: {
		type: "file",
		label: "File",
		menuLabel: "Upload file",
		icon: Paperclip,
	},
} satisfies Record<WorkspaceItemType, WorkspaceItemRegistryEntry>;

export function getWorkspaceObjectRegistryEntry(type: WorkspaceItemType) {
	return workspaceObjectRegistry[type];
}
