import {
	assertAccessScope,
	createAccessActor,
	type ScopedAccessContext,
} from "#/features/workspaces/operations/access-context";

export const workspaceAccessScopes = ["workspace:read", "workspace:write"] as const;

export type WorkspaceAccessScope = (typeof workspaceAccessScopes)[number];

export interface WorkspaceAccessContext extends ScopedAccessContext<WorkspaceAccessScope> {
	operationId: string;
	workspaceId: string;
}

export function createWorkspaceAccessContext(input: {
	scopes: readonly WorkspaceAccessScope[];
	operationId: string;
	userId: string;
	workspaceId: string;
}): WorkspaceAccessContext {
	return {
		actor: createAccessActor(input),
		operationId: input.operationId,
		workspaceId: input.workspaceId,
	};
}

export function assertWorkspaceAccessScope(
	context: WorkspaceAccessContext,
	scope: WorkspaceAccessScope,
) {
	assertAccessScope(context, "workspace", scope);
}
