import { FilePen, Folder, Layers3, ListChecks, type LucideIcon, Paperclip } from "lucide-react";

import type { WorkspaceItemType } from "#/features/workspaces/contracts";
export type WorkspaceItemCreateGroup = "primary" | "learn";

export interface WorkspaceItemRegistryEntry {
	type: WorkspaceItemType;
	label: string;
	menuLabel: string;
	menuGroup: WorkspaceItemCreateGroup;
	creatable: boolean;
	icon: LucideIcon;
}

export const workspaceObjectRegistry = {
	folder: {
		type: "folder",
		label: "Folder",
		menuLabel: "Folder",
		menuGroup: "primary",
		creatable: true,
		icon: Folder,
	},
	document: {
		type: "document",
		label: "Document",
		menuLabel: "Document",
		menuGroup: "primary",
		creatable: true,
		icon: FilePen,
	},
	file: {
		type: "file",
		label: "File",
		menuLabel: "Upload file",
		menuGroup: "primary",
		creatable: false,
		icon: Paperclip,
	},
	flashcard: {
		type: "flashcard",
		label: "Flashcard deck",
		menuLabel: "Flashcards",
		menuGroup: "learn",
		creatable: true,
		icon: Layers3,
	},
	quiz: {
		type: "quiz",
		label: "Quiz",
		menuLabel: "Quiz",
		menuGroup: "learn",
		creatable: true,
		icon: ListChecks,
	},
} satisfies Record<WorkspaceItemType, WorkspaceItemRegistryEntry>;

export function getWorkspaceObjectRegistryEntry(type: WorkspaceItemType) {
	return workspaceObjectRegistry[type];
}

export const workspaceObjectRegistryEntries: WorkspaceItemRegistryEntry[] =
	Object.values(workspaceObjectRegistry);

export const creatableWorkspaceObjectEntries = workspaceObjectRegistryEntries.filter(
	(entry) => entry.creatable,
);
