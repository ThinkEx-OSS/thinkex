import {
	WORKSPACE_ITEM_NAME_MAX_LENGTH,
	type WorkspaceColor,
	type WorkspaceIcon,
	type WorkspaceItemType,
	type WorkspaceTheme,
	getWorkspaceItemRegistryEntry,
} from "#/features/workspaces/contracts";

export const DEFAULT_WORKSPACE_NAME = "Untitled Workspace";
export const DEFAULT_WORKSPACE_COLOR = "sky" satisfies WorkspaceColor;
export const DEFAULT_WORKSPACE_ICON = "compass" satisfies WorkspaceIcon;
// Lives here rather than in the theme catalogue so the server can write it on
// insert without pulling in the catalogue's import.meta.glob over 117 images.
export const DEFAULT_WORKSPACE_THEME = "default" satisfies WorkspaceTheme;
export const WORKSPACE_ITEM_SORT_STEP = 1024;

export function getAvailableWorkspaceItemName(input: {
	type: WorkspaceItemType;
	existingNames: Iterable<string>;
	requestedName?: string;
}) {
	const requestedName = input.requestedName
		? normalizeWorkspaceItemName(input.requestedName, "")
		: "";
	const baseName = requestedName || getWorkspaceItemRegistryEntry(input.type).defaultName;
	const existingNames = new Set(Array.from(input.existingNames, getWorkspaceItemNameKey));

	if (requestedName && !existingNames.has(getWorkspaceItemNameKey(baseName))) {
		return baseName;
	}

	if (!requestedName) {
		for (let suffix = 1; suffix < 1000; suffix += 1) {
			const candidate = `${baseName} ${suffix}`;

			if (!existingNames.has(getWorkspaceItemNameKey(candidate))) {
				return candidate;
			}
		}

		return `${baseName} ${crypto.randomUUID().slice(0, 8)}`;
	}

	for (let suffix = 2; suffix < 1000; suffix += 1) {
		const candidate = `${baseName} ${suffix}`;

		if (!existingNames.has(getWorkspaceItemNameKey(candidate))) {
			return candidate;
		}
	}

	return `${baseName} ${crypto.randomUUID().slice(0, 8)}`;
}

export function normalizeWorkspaceItemName(name: string | null | undefined, fallback = "Untitled") {
	const normalized = stripControlCharacters(name ?? "")
		.normalize("NFC")
		.replace(/[<>:"/\\|?*]+/g, "-")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, WORKSPACE_ITEM_NAME_MAX_LENGTH)
		.trim()
		.replace(/[. ]+$/g, "");

	if (!normalized) {
		return fallback;
	}

	return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(normalized)
		? `_${normalized}`.slice(0, WORKSPACE_ITEM_NAME_MAX_LENGTH)
		: normalized;
}

export function getWorkspaceItemNameKey(name: string) {
	return name.normalize("NFC").toLowerCase();
}

function stripControlCharacters(value: string) {
	return Array.from(value)
		.filter((character) => {
			const code = character.charCodeAt(0);

			return code >= 32 && code !== 127;
		})
		.join("");
}
