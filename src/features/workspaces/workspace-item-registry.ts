import { z } from "zod";

const workspaceItemTypes = ["folder", "document", "file", "flashcard", "quiz"] as const;
export const workspaceItemTypeSchema = z.enum(workspaceItemTypes);
export type WorkspaceItemType = z.infer<typeof workspaceItemTypeSchema>;

interface WorkspaceItemRegistryEntry {
	color: "amber" | "emerald" | "rose" | "sky" | "violet";
	contentKind: "document" | "empty" | "flashcard" | "quiz";
	defaultName: string;
	extension: "json" | "txt" | null;
	label: string;
	menuLabel: string;
	mimeType: "application/json" | "inode/directory" | "text/plain";
}

const workspaceItemRegistry = {
	folder: {
		color: "amber",
		contentKind: "empty",
		defaultName: "New folder",
		extension: null,
		label: "Folder",
		menuLabel: "Folder",
		mimeType: "inode/directory",
	},
	document: {
		color: "sky",
		contentKind: "document",
		defaultName: "New document",
		extension: "json",
		label: "Document",
		menuLabel: "Document",
		mimeType: "application/json",
	},
	file: {
		color: "rose",
		contentKind: "empty",
		defaultName: "New file",
		extension: "txt",
		label: "File",
		menuLabel: "Upload file",
		mimeType: "text/plain",
	},
	flashcard: {
		color: "violet",
		contentKind: "flashcard",
		defaultName: "New flashcards",
		extension: "json",
		label: "Flashcard deck",
		menuLabel: "Flashcards",
		mimeType: "application/json",
	},
	quiz: {
		color: "emerald",
		contentKind: "quiz",
		defaultName: "New quiz",
		extension: "json",
		label: "Quiz",
		menuLabel: "Quiz",
		mimeType: "application/json",
	},
} satisfies Record<WorkspaceItemType, WorkspaceItemRegistryEntry>;

export function getWorkspaceItemRegistryEntry(type: WorkspaceItemType) {
	return workspaceItemRegistry[type];
}
