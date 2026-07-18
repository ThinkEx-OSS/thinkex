import { FilePen, Folder, Layers3, ListChecks, Paperclip } from "lucide-react";

import type { WorkspaceItemType } from "#/features/workspaces/contracts";
import { getWorkspaceItemRegistryEntry } from "#/features/workspaces/workspace-item-registry";

const workspaceItemIcons = {
	document: FilePen,
	file: Paperclip,
	flashcard: Layers3,
	folder: Folder,
	quiz: ListChecks,
} satisfies Record<WorkspaceItemType, typeof FilePen>;

export function getWorkspaceObjectRegistryEntry(type: WorkspaceItemType) {
	return {
		...getWorkspaceItemRegistryEntry(type),
		icon: workspaceItemIcons[type],
		type,
	};
}
