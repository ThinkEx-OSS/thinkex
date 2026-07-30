export const WORKSPACE_KERNEL_ITEM_NOT_FOUND_MESSAGE = "Workspace item not found.";

/**
 * Thrown when a workspace item cannot be resolved because it is missing or has
 * been soft-deleted. Callers can catch this to treat the condition as terminal
 * (e.g. abandon an in-flight extraction) rather than retryable.
 */
export class WorkspaceKernelItemNotFoundError extends Error {
	constructor(readonly itemId: string) {
		super(WORKSPACE_KERNEL_ITEM_NOT_FOUND_MESSAGE);
		this.name = "WorkspaceKernelItemNotFoundError";
	}
}

/**
 * Detects a {@link WorkspaceKernelItemNotFoundError}, including instances that
 * have crossed the workspace kernel RPC boundary. The Agent stub reconstructs
 * thrown errors as plain `Error`s, so `instanceof` no longer holds — the name
 * and message are the durable signal for callers outside the kernel.
 */
export function isWorkspaceKernelItemNotFoundError(error: unknown): boolean {
	if (error instanceof WorkspaceKernelItemNotFoundError) {
		return true;
	}
	if (!(error instanceof Error)) {
		return false;
	}
	return (
		error.name === "WorkspaceKernelItemNotFoundError" ||
		error.message === WORKSPACE_KERNEL_ITEM_NOT_FOUND_MESSAGE
	);
}
