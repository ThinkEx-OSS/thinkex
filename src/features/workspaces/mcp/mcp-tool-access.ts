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

export function mcpListWorkspacesAccessDeniedResult(code: McpToolAccessFailureCode) {
	return {
		workspaces: [],
		failed: [{ code }],
	};
}

export function mcpListItemsAccessDeniedResult(path: string, code: McpToolAccessFailureCode) {
	return {
		path,
		more: false,
		items: [],
		failed: [{ code }],
	};
}

export function mcpReadItemsAccessDeniedResult(code: McpToolAccessFailureCode) {
	return {
		items: [],
		failed: [{ code }],
	};
}
