import {
	type WorkspaceItemColor,
	type WorkspaceItemType,
	workspaceColorSchema,
} from "#/features/workspaces/contracts";
import {
	getRandomWorkspaceColor,
	workspaceColorOptions,
	workspaceColors,
} from "#/features/workspaces/model/workspace-colors";

export const workspaceItemTypeColors = {
	document: "sky",
	file: "rose",
	flashcard: "violet",
	folder: "amber",
	quiz: "emerald",
} as const satisfies Record<WorkspaceItemType, WorkspaceItemColor>;

export const workspaceItemColorOptions = workspaceColorOptions;

export function workspaceItemSupportsCustomColor(type: WorkspaceItemType) {
	return type === "folder";
}

export function getWorkspaceItemColorValue(color: string | null): WorkspaceItemColor | null {
	const parsed = workspaceColorSchema.safeParse(color);

	return parsed.success ? parsed.data : null;
}

// Non-folder items ignore stored color; palette comes from workspaceItemTypeColors.
export function resolveWorkspaceItemColor(input: {
	type: WorkspaceItemType;
	color: string | null;
}): WorkspaceItemColor {
	if (input.type === "folder") {
		return getWorkspaceItemColorValue(input.color) ?? workspaceItemTypeColors.folder;
	}

	return workspaceItemTypeColors[input.type];
}

export function resolveWorkspaceItemColorForCreate(input: {
	type: WorkspaceItemType;
	color?: WorkspaceItemColor;
}): WorkspaceItemColor | null {
	if (input.type === "folder") {
		return input.color ?? getRandomWorkspaceColor();
	}

	return null;
}

export function getWorkspaceItemPalette(input: { type: WorkspaceItemType; color: string | null }) {
	return workspaceColors[resolveWorkspaceItemColor(input)];
}
