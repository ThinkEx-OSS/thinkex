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

	if (!(error instanceof Error)) {
		return false;
	}

	return (
		error.name === "WorkspaceKernelNameConflictError" ||
		error.message === "Workspace item name already exists." ||
		error.message === "WorkspaceKernelNameConflictError: Workspace item name already exists."
	);
}
