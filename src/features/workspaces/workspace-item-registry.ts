import { z } from "zod";

// Item kinds that can be created and stored. The database column and its
// `workspace_items_type_check` constraint are built from this list.
export const WORKSPACE_ITEM_TYPES = ["folder", "document", "flashcard", "quiz", "file"] as const;

// A read-only stand-in for a stored row whose kind this build no longer knows,
// e.g. a row a reverted feature left behind. It is never written; it only lets
// an unreadable row degrade to a placeholder instead of failing the whole
// workspace read.
export const WORKSPACE_ITEM_PLACEHOLDER_TYPE = "unknown";
const WORKSPACE_ITEM_DISPLAY_TYPES = [
	...WORKSPACE_ITEM_TYPES,
	WORKSPACE_ITEM_PLACEHOLDER_TYPE,
] as const;

// Reads accept the placeholder so an unknown stored kind can degrade instead of
// throwing; writes validate against the narrower persistable set.
export const workspaceItemTypeSchema = z.enum(WORKSPACE_ITEM_DISPLAY_TYPES);
export const workspaceItemStoredTypeSchema = z.enum(WORKSPACE_ITEM_TYPES);
export type WorkspaceItemType = z.infer<typeof workspaceItemTypeSchema>;

/**
 * Shared storage lifecycle only. Item-specific reading, editing, and rendering
 * must dispatch on the concrete item type.
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
	quiz: {
		color: "emerald",
		contentKind: "structured",
		defaultName: "New quiz",
		isContainer: false,
		label: "Quiz",
		menuLabel: "Quiz",
	},
	file: {
		color: "rose",
		contentKind: "file",
		defaultName: "New file",
		isContainer: false,
		label: "File",
		menuLabel: "Upload file",
	},
	unknown: {
		color: "amber",
		contentKind: "none",
		defaultName: "Unavailable item",
		isContainer: false,
		label: "Unavailable item",
		menuLabel: "Unavailable item",
	},
} as const satisfies Record<WorkspaceItemType, WorkspaceItemRegistryEntry>;

/**
 * The display type for a stored `type` value. A kind this build no longer knows
 * (e.g. one a reverted feature left behind) degrades to the read-only
 * placeholder so a single unreadable row cannot fail a whole workspace read.
 */
export function toWorkspaceItemDisplayType(storedType: string): WorkspaceItemType {
	const parsed = workspaceItemTypeSchema.safeParse(storedType);
	return parsed.success ? parsed.data : WORKSPACE_ITEM_PLACEHOLDER_TYPE;
}

export function getWorkspaceItemRegistryEntry(type: WorkspaceItemType) {
	return workspaceItemRegistry[type];
}

export function isWorkspaceItemContainer(type: WorkspaceItemType) {
	return workspaceItemRegistry[type].isContainer;
}

export function getWorkspaceItemContentKind(type: WorkspaceItemType) {
	return workspaceItemRegistry[type].contentKind;
}
