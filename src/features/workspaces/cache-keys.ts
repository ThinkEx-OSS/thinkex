export const workspacesQueryKey = ["workspaces"] as const;

export function workspacePageQueryKey(workspaceId: string) {
	return ["workspaces", workspaceId, "page"] as const;
}

export function workspaceItemContentQueryKey(workspaceId: string, itemId: string) {
	return ["workspaces", workspaceId, "items", itemId, "content"] as const;
}
