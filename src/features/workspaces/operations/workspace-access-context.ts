import {
	assertAccessScope,
	type AccessActor,
	createAccessActor,
	type ScopedAccessContext,
} from "#/features/workspaces/operations/access-context";

export const workspaceAccessScopes = ["workspace:read", "workspace:write"] as const;

export type WorkspaceAccessScope = (typeof workspaceAccessScopes)[number];

export type WorkspaceAccessActor = AccessActor<WorkspaceAccessScope>;

export interface WorkspaceAccessContext extends ScopedAccessContext<WorkspaceAccessScope> {
	workspaceId: string;
}

export function createWorkspaceAccessContext(input: {
	scopes: readonly WorkspaceAccessScope[];
	userId: string;
	workspaceId: string;
}): WorkspaceAccessContext {
	return {
		actor: createAccessActor(input),
		workspaceId: input.workspaceId,
	};
}

export function assertWorkspaceAccessScope(
	context: WorkspaceAccessContext,
	scope: WorkspaceAccessScope,
) {
	assertAccessScope(context, "workspace", scope);
}
