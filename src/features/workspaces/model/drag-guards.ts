import type {
	WorkspaceDragRow,
	WorkspaceSplitDropSide,
} from "#/features/workspaces/model/drag-types";

export function isWorkspaceDragRow(value: unknown): value is WorkspaceDragRow {
	return value === "folder" || value === "item";
}

export function isWorkspaceSplitDropSide(value: unknown): value is WorkspaceSplitDropSide {
	return value === "left" || value === "right" || value === "top" || value === "bottom";
}
