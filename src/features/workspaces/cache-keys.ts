export const workspacesQueryKey = ["workspaces"] as const;

export function workspacePageQueryKey(workspaceId: string) {
	return ["workspaces", workspaceId, "page"] as const;
}
