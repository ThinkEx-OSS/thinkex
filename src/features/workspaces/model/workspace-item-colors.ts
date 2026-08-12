import {
	type WorkspaceColor,
	type WorkspaceItemType,
	getWorkspaceItemRegistryEntry,
	isWorkspaceItemContainer,
	workspaceColorSchema,
} from "#/features/workspaces/contracts";
import {
	getRandomWorkspaceColor,
	workspaceColors,
} from "#/features/workspaces/model/workspace-colors";

/**
 * Only containers carry a user-chosen colour. Everything else takes the
 * registry's colour for its type, so a stored value on one is ignored.
 */
export function workspaceItemSupportsCustomColor(type: WorkspaceItemType) {
	return isWorkspaceItemContainer(type);
}

export function getWorkspaceItemColorValue(color: string | null): WorkspaceColor | null {
	const parsed = workspaceColorSchema.safeParse(color);

	return parsed.success ? parsed.data : null;
}

export function resolveWorkspaceItemColor(input: {
	type: WorkspaceItemType;
	color: string | null;
}): WorkspaceColor {
	const registryColor = getWorkspaceItemRegistryEntry(input.type).color;

	return workspaceItemSupportsCustomColor(input.type)
		? (getWorkspaceItemColorValue(input.color) ?? registryColor)
		: registryColor;
}

export function resolveWorkspaceItemColorForCreate(input: {
	type: WorkspaceItemType;
	color?: WorkspaceColor;
}): WorkspaceColor | null {
	if (!workspaceItemSupportsCustomColor(input.type)) {
		return null;
	}

	return input.color ?? getRandomWorkspaceColor();
}

export function getWorkspaceItemPalette(input: { type: WorkspaceItemType; color: string | null }) {
	return workspaceColors[resolveWorkspaceItemColor(input)];
}
