/** Return the R2 prefix owned by one workspace recording. */
export function getWorkspaceRecordingObjectPrefix(input: {
	readonly itemId: string;
	readonly workspaceId: string;
}) {
	return `workspace_recordings/${input.workspaceId}/${input.itemId}/`;
}
