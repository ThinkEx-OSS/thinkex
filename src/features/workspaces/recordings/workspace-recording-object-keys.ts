/** Return the R2 prefix owned by one workspace recording. */
export function getWorkspaceRecordingObjectPrefix(input: {
	readonly itemId: string;
	readonly workspaceId: string;
}) {
	return `workspace_recordings/${input.workspaceId}/${input.itemId}/`;
}

/** Return the deterministic R2 key for an immutable recording segment. */
export function getWorkspaceRecordingSegmentObjectKey(input: {
	readonly itemId: string;
	readonly sequence: number;
	readonly workspaceId: string;
}) {
	return `${getWorkspaceRecordingObjectPrefix(input)}segments/${String(input.sequence).padStart(6, "0")}`;
}
