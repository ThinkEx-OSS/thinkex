const workspaceFileObjectPrefix = "workspace_file_objects";
const workspaceFileUploadPrefix = "workspace_file_uploads";

function getWorkspaceFileObjectPrefix(workspaceId: string) {
	return `${workspaceFileObjectPrefix}/${workspaceId}/`;
}

export function getWorkspaceFileItemObjectPrefix(input: { workspaceId: string; itemId: string }) {
	return `${getWorkspaceFileObjectPrefix(input.workspaceId)}${input.itemId}/`;
}

export function getWorkspaceFileSourceObjectKey(input: { workspaceId: string; itemId: string }) {
	return `${getWorkspaceFileItemObjectPrefix(input)}source`;
}

export function getWorkspaceFilePreviewObjectKey(input: { workspaceId: string; itemId: string }) {
	return `${getWorkspaceFileItemObjectPrefix(input)}preview.webp`;
}

export function getWorkspaceFileUploadObjectKey(input: { itemId: string; workspaceId: string }) {
	return `${workspaceFileUploadPrefix}/${input.workspaceId}/${input.itemId}/source`;
}
