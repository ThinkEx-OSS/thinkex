export function getWorkspaceFileContentUrl(workspaceId: string, itemId: string) {
	return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(itemId)}/content`;
}

export function getWorkspaceFilePreviewUrl(workspaceId: string, itemId: string) {
	return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(itemId)}/preview`;
}
