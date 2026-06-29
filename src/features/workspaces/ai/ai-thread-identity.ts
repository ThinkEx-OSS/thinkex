const DEFAULT_WORKSPACE_THREAD_PREFIX = "workspace:";
const DEFAULT_WORKSPACE_THREAD_SUFFIX = ":default";

export function getDefaultWorkspaceThreadId(workspaceId: string) {
	return `${DEFAULT_WORKSPACE_THREAD_PREFIX}${workspaceId}${DEFAULT_WORKSPACE_THREAD_SUFFIX}`;
}

export function getWorkspaceIdFromDefaultThreadId(threadId: string) {
	if (
		!threadId.startsWith(DEFAULT_WORKSPACE_THREAD_PREFIX) ||
		!threadId.endsWith(DEFAULT_WORKSPACE_THREAD_SUFFIX)
	) {
		return null;
	}

	const workspaceId = threadId.slice(
		DEFAULT_WORKSPACE_THREAD_PREFIX.length,
		-DEFAULT_WORKSPACE_THREAD_SUFFIX.length,
	);

	return workspaceId || null;
}
