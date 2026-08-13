import { z } from "zod";

export const WORKSPACE_ITEM_TYPES = ["folder", "document", "flashcard", "file"] as const;
export const workspaceItemTypeSchema = z.enum(WORKSPACE_ITEM_TYPES);
export type WorkspaceItemType = z.infer<typeof workspaceItemTypeSchema>;

/**
 * Where an item's content lives. Code that asks "can I read/write this item's
 * body?" must branch on this rather than on the type, because the two are not
 * the same question: a future type can share `document` storage without being a
 * document, and `none` covers every item whose body is the tree itself.
 */
type WorkspaceItemContentKind = "document" | "file" | "none" | "structured";

interface WorkspaceItemRegistryEntry {
	color: "amber" | "emerald" | "rose" | "sky" | "violet";
	contentKind: WorkspaceItemContentKind;
	defaultName: string;
	/**
	 * Whether the item can hold children. Code that asks "may this be a move
	 * target / does this have descendants?" must branch on this rather than on
	 * `type === "folder"`, which only happens to be the sole container today.
	 */
	isContainer: boolean;
	label: string;
	menuLabel: string;
}

const workspaceItemRegistry = {
	folder: {
		color: "amber",
		contentKind: "none",
		defaultName: "New folder",
		isContainer: true,
		label: "Folder",
		menuLabel: "Folder",
	},
	document: {
		color: "sky",
		contentKind: "document",
		defaultName: "New document",
		isContainer: false,
		label: "Document",
		menuLabel: "Document",
	},
	flashcard: {
		color: "violet",
		contentKind: "structured",
		defaultName: "New flashcards",
		isContainer: false,
		label: "Flashcards",
		menuLabel: "Flashcards",
	},
	file: {
		color: "rose",
		contentKind: "file",
		defaultName: "New file",
		isContainer: false,
		label: "File",
		menuLabel: "Upload file",
	},
} as const satisfies Record<WorkspaceItemType, WorkspaceItemRegistryEntry>;

export function getWorkspaceItemRegistryEntry(type: WorkspaceItemType) {
	return workspaceItemRegistry[type];
}

export function isWorkspaceItemContainer(type: WorkspaceItemType) {
	return workspaceItemRegistry[type].isContainer;
}

export function getWorkspaceItemContentKind(type: WorkspaceItemType) {
	return workspaceItemRegistry[type].contentKind;
}
