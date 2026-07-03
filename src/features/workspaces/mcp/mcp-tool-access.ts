import { AccessScopeError } from "#/features/workspaces/operations/access-context";
import { WorkspaceForbiddenError } from "#/features/workspaces/server/permissions";

export const mcpToolAccessFailureCodes = ["insufficient_scope", "workspace_forbidden"] as const;

export type McpToolAccessFailureCode = (typeof mcpToolAccessFailureCodes)[number];

export function isMcpToolAccessError(
	error: unknown,
): error is WorkspaceForbiddenError | AccessScopeError<string> {
	return error instanceof WorkspaceForbiddenError || error instanceof AccessScopeError;
}

export function resolveMcpToolAccessFailureCode(
	error: WorkspaceForbiddenError | AccessScopeError<string>,
): McpToolAccessFailureCode {
	return error instanceof WorkspaceForbiddenError ? "workspace_forbidden" : "insufficient_scope";
}

export function mcpListWorkspacesAccessDeniedResult() {
	return {
		workspaces: [],
		failed: [{ code: "insufficient_scope" as const }],
	};
}

export function mcpListItemsAccessDeniedResult(path = "/") {
	return {
		path,
		more: false,
		items: [],
		failed: [{ code: "workspace_forbidden" as const }],
	};
}

export function mcpReadItemsAccessDeniedResult() {
	return {
		items: [],
		failed: [{ code: "workspace_forbidden" as const }],
	};
}
