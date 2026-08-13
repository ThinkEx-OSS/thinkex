import { type WorkspaceItem, isWorkspaceItemContainer } from "#/features/workspaces/contracts";
import { normalizeWorkspaceItemName } from "#/features/workspaces/defaults";

export interface WorkspaceTree {
	childrenByParentId: Map<string | null, WorkspaceItem[]>;
}

export interface WorkspaceCwd {
	path: string;
	parentId: string | null;
}

export type WorkspacePathErrorCode = "path_not_absolute" | "path_not_folder" | "path_not_found";

export class WorkspacePathError extends Error {
	constructor(readonly code: WorkspacePathErrorCode) {
		super(code);
		this.name = "WorkspacePathError";
	}
}

export function buildWorkspaceTree(items: WorkspaceItem[]): WorkspaceTree {
	const childrenByParentId = new Map<string | null, WorkspaceItem[]>();

	for (const item of items) {
		const children = childrenByParentId.get(item.parentId) ?? [];
		children.push(item);
		childrenByParentId.set(item.parentId, children);
	}

	for (const children of childrenByParentId.values()) {
		children.sort(compareWorkspaceItems);
	}

	return {
		childrenByParentId,
	};
}

export function resolveWorkspaceCwd(path: string, tree: WorkspaceTree): WorkspaceCwd {
	const normalizedPath = normalizeWorkspacePath(path);

	if (normalizedPath === "/") {
		return {
			path: "/",
			parentId: null,
		};
	}

	const item = resolveWorkspaceItemPath(normalizedPath, tree);

	if (!item) {
		throw new WorkspacePathError("path_not_found");
	}

	if (!isWorkspaceItemContainer(item.type)) {
		throw new WorkspacePathError("path_not_folder");
	}

	return {
		path: normalizedPath,
		parentId: item.id,
	};
}

export function resolveWorkspaceItemPath(path: string, tree: WorkspaceTree): WorkspaceItem | null {
	const normalizedPath = normalizeWorkspacePath(path);

	if (normalizedPath === "/") {
		return null;
	}

	const segments = normalizedPath.split("/").filter(Boolean);
	let parentId: string | null = null;
	let item: WorkspaceItem | null = null;

	for (const segment of segments) {
		item =
			(tree.childrenByParentId.get(parentId) ?? []).find((child) => {
				return toWorkspacePathSegment(child.name) === segment;
			}) ?? null;

		if (!item) {
			return null;
		}

		parentId = item.id;
	}

	return item;
}

export function normalizeWorkspacePath(path: string) {
	const trimmedPath = path.trim();

	if (!trimmedPath || trimmedPath === "/") {
		return "/";
	}

	if (!trimmedPath.startsWith("/")) {
		throw new WorkspacePathError("path_not_absolute");
	}

	const segments = trimmedPath.split("/").flatMap((segment) => {
		const normalizedSegment = segment.trim();
		return normalizedSegment ? [normalizedSegment] : [];
	});

	return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

export function joinWorkspacePathSegment(parentPath: string, name: string) {
	const segment = toWorkspacePathSegment(name);
	return parentPath ? `${parentPath}/${segment}` : segment;
}

export function getParentWorkspacePath(path: string) {
	const lastSlashIndex = path.lastIndexOf("/");

	if (lastSlashIndex <= 0) {
		return "/";
	}

	return path.slice(0, lastSlashIndex);
}

export function getWorkspacePathName(path: string) {
	return path.split("/").filter(Boolean).at(-1) ?? "";
}

export function joinWorkspaceItemPath(parentPath: string, name: string) {
	const relativePath = joinWorkspacePathSegment("", name);

	if (parentPath === "/") {
		return `/${relativePath}`;
	}

	return `${parentPath}/${relativePath}`;
}

export function buildWorkspaceItemPathIndex(items: WorkspaceItem[]) {
	const tree = buildWorkspaceTree(items);
	const paths = new Map<string, string>();

	const visit = (parentId: string | null, parentPath: string) => {
		for (const child of tree.childrenByParentId.get(parentId) ?? []) {
			const path = joinWorkspaceItemPath(parentPath, child.name);
			paths.set(child.id, path);
			visit(child.id, path);
		}
	};

	visit(null, "/");

	return paths;
}

export function toWorkspacePathSegment(name: string) {
	return normalizeWorkspaceItemName(name);
}

function compareWorkspaceItems(left: WorkspaceItem, right: WorkspaceItem) {
	return (
		left.sortOrder - right.sortOrder ||
		left.name.localeCompare(right.name) ||
		left.id.localeCompare(right.id)
	);
}
