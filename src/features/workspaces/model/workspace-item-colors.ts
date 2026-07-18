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
import { getWorkspaceItemRegistryEntry } from "#/features/workspaces/workspace-item-registry";

export const workspaceItemColorOptions = workspaceColorOptions;

export function workspaceItemSupportsCustomColor(type: WorkspaceItemType) {
	return type === "folder";
}

export function getWorkspaceItemColorValue(color: string | null): WorkspaceItemColor | null {
	const parsed = workspaceColorSchema.safeParse(color);

	return parsed.success ? parsed.data : null;
}

// Non-folder items ignore stored color; palette comes from the item registry.
export function resolveWorkspaceItemColor(input: {
	type: WorkspaceItemType;
	color: string | null;
}): WorkspaceItemColor {
	if (input.type === "folder") {
		return getWorkspaceItemColorValue(input.color) ?? getWorkspaceItemRegistryEntry("folder").color;
	}

	return getWorkspaceItemRegistryEntry(input.type).color;
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
