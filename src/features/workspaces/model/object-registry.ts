import { FilePen, Folder, Layers3, ListChecks, type LucideIcon, Paperclip } from "lucide-react";

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
	flashcard: {
		type: "flashcard",
		label: "Flashcard deck",
		menuLabel: "Flashcards",
		icon: Layers3,
	},
	quiz: {
		type: "quiz",
		label: "Quiz",
		menuLabel: "Quiz",
		icon: ListChecks,
	},
} satisfies Record<WorkspaceItemType, WorkspaceItemRegistryEntry>;

export function getWorkspaceObjectRegistryEntry(type: WorkspaceItemType) {
	return workspaceObjectRegistry[type];
}
