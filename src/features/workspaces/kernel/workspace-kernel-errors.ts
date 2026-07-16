export class WorkspaceKernelNameConflictError extends Error {
	constructor(
		readonly itemId?: string,
		readonly requestedName?: string,
	) {
		super("Workspace item name already exists.");
		this.name = "WorkspaceKernelNameConflictError";
	}
}

export function isWorkspaceKernelNameConflictError(
	error: unknown,
): error is WorkspaceKernelNameConflictError {
	if (error instanceof WorkspaceKernelNameConflictError) {
		return true;
	}

	const serialized = String(error);

	return [
		"WorkspaceKernelNameConflictError: Workspace item name already exists.",
		"Error: WorkspaceKernelNameConflictError: Workspace item name already exists.",
		"Error: Workspace item name already exists.",
	].includes(serialized);
}
