import type {
	WorkspaceColor,
	WorkspaceIcon,
	WorkspaceItemType,
} from "#/features/workspaces/contracts";

export const DEFAULT_WORKSPACE_NAME = "Untitled Workspace";
export const DEFAULT_WORKSPACE_COLOR = "sky" satisfies WorkspaceColor;
export const DEFAULT_WORKSPACE_ICON = "compass" satisfies WorkspaceIcon;
export const WORKSPACE_ITEM_SORT_STEP = 1024;

export function getDefaultWorkspaceItemName(type: WorkspaceItemType) {
	switch (type) {
		case "folder":
			return "New folder";
		case "document":
			return "New document";
		case "file":
			return "New file";
		case "flashcard":
			return "New flashcards";
		case "quiz":
			return "New quiz";
	}
}

export function getWorkspaceItemTypeMeta(type: WorkspaceItemType) {
	switch (type) {
		case "folder":
			return "Folder";
		case "document":
			return "Document";
		case "file":
			return "File";
		case "flashcard":
			return "Flashcards";
		case "quiz":
			return "Quiz";
	}
}

export function getAvailableWorkspaceItemName(input: {
	type: WorkspaceItemType;
	existingNames: Iterable<string>;
	requestedName?: string;
}) {
	const requestedName = input.requestedName
		? normalizeWorkspaceItemName(input.requestedName, "")
		: "";
	const baseName = requestedName || getDefaultWorkspaceItemName(input.type);
	const existingNames = new Set(input.existingNames);

	if (requestedName && !existingNames.has(baseName)) {
		return baseName;
	}

	if (!requestedName) {
		for (let suffix = 1; suffix < 1000; suffix += 1) {
			const candidate = `${baseName} ${suffix}`;

			if (!existingNames.has(candidate)) {
				return candidate;
			}
		}

		return `${baseName} ${crypto.randomUUID().slice(0, 8)}`;
	}

	for (let suffix = 2; suffix < 1000; suffix += 1) {
		const candidate = `${baseName} ${suffix}`;

		if (!existingNames.has(candidate)) {
			return candidate;
		}
	}

	return `${baseName} ${crypto.randomUUID().slice(0, 8)}`;
}

export function normalizeWorkspaceItemName(name: string | null | undefined, fallback = "Untitled") {
	const normalized =
		stripControlCharacters(name ?? "")
			.replace(/[\\/]+/g, "-")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 160)
			.trim() ?? "";

	return normalized || fallback;
}

function stripControlCharacters(value: string) {
	return Array.from(value)
		.filter((character) => {
			const code = character.charCodeAt(0);

			return code >= 32 && code !== 127;
		})
		.join("");
}
