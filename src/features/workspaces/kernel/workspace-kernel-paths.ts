import { type WorkspaceItem, isWorkspaceItemContainer } from "#/features/workspaces/contracts";
import { normalizeWorkspaceItemName } from "#/features/workspaces/defaults";

export interface WorkspaceKernelTree {
	childrenByParentId: Map<string | null, WorkspaceItem[]>;
}

export interface WorkspaceKernelCwd {
	path: string;
	parentId: string | null;
}

export type WorkspaceKernelPathErrorCode =
	| "path_not_absolute"
	| "path_not_folder"
	| "path_not_found";

export class WorkspaceKernelPathError extends Error {
	constructor(readonly code: WorkspaceKernelPathErrorCode) {
		super(code);
		this.name = "WorkspaceKernelPathError";
	}
}

export function buildWorkspaceKernelTree(items: WorkspaceItem[]): WorkspaceKernelTree {
	const childrenByParentId = new Map<string | null, WorkspaceItem[]>();

	for (const item of items) {
		const children = childrenByParentId.get(item.parentId) ?? [];
		children.push(item);
		childrenByParentId.set(item.parentId, children);
	}

	for (const children of childrenByParentId.values()) {
		children.sort(compareWorkspaceKernelItems);
	}

	return {
		childrenByParentId,
	};
}

export function resolveWorkspaceKernelCwd(
	path: string,
	tree: WorkspaceKernelTree,
): WorkspaceKernelCwd {
	const normalizedPath = normalizeWorkspacePath(path);

	if (normalizedPath === "/") {
		return {
			path: "/",
			parentId: null,
		};
	}

	const item = resolveWorkspaceKernelItemPath(normalizedPath, tree);

	if (!item) {
		throw new WorkspaceKernelPathError("path_not_found");
	}

	if (!isWorkspaceItemContainer(item.type)) {
		throw new WorkspaceKernelPathError("path_not_folder");
	}

	return {
		path: normalizedPath,
		parentId: item.id,
	};
}

export function resolveWorkspaceKernelItemPath(
	path: string,
	tree: WorkspaceKernelTree,
): WorkspaceItem | null {
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
		throw new WorkspaceKernelPathError("path_not_absolute");
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

export function buildWorkspaceKernelItemPathIndex(items: WorkspaceItem[]) {
	const tree = buildWorkspaceKernelTree(items);
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

function compareWorkspaceKernelItems(left: WorkspaceItem, right: WorkspaceItem) {
	return (
		left.sortOrder - right.sortOrder ||
		left.name.localeCompare(right.name) ||
		left.id.localeCompare(right.id)
	);
}
