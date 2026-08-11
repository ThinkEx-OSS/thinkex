import { FilePen, Folder, Paperclip } from "lucide-react";

import type { WorkspaceItemType } from "#/features/workspaces/contracts";
import { getWorkspaceItemRegistryEntry } from "#/features/workspaces/workspace-item-registry";

const workspaceItemIcons = {
	document: FilePen,
	file: Paperclip,
	folder: Folder,
} satisfies Record<WorkspaceItemType, typeof FilePen>;

export function getWorkspaceObjectRegistryEntry(type: WorkspaceItemType) {
	return {
		...getWorkspaceItemRegistryEntry(type),
		icon: workspaceItemIcons[type],
		type,
	};
}
