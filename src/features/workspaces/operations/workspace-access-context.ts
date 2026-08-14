import type { WorkspaceReferenceRecord } from "#/features/workspaces/locations/workspace-location";
import {
	assertAccessScope,
	createAccessActor,
	type ScopedAccessContext,
} from "#/features/workspaces/operations/access-context";

export const workspaceAccessScopes = ["workspace:read", "workspace:write"] as const;

export type WorkspaceAccessScope = (typeof workspaceAccessScopes)[number];

export interface WorkspaceAccessContext extends ScopedAccessContext<WorkspaceAccessScope> {
	operationId: string;
	/**
	 * Resolves short refs retained in the chat transcript for reads, edits,
	 * citations, and navigation. Absent outside a chat turn.
	 */
	resolveWorkspaceReferences?: (refs: readonly string[]) => Promise<WorkspaceReferenceRecord[]>;
	workspaceId: string;
}

export function createWorkspaceAccessContext(input: {
	scopes: readonly WorkspaceAccessScope[];
	operationId: string;
	resolveWorkspaceReferences?: (refs: readonly string[]) => Promise<WorkspaceReferenceRecord[]>;
	userId: string;
	workspaceId: string;
}): WorkspaceAccessContext {
	return {
		actor: createAccessActor(input),
		operationId: input.operationId,
		...(input.resolveWorkspaceReferences
			? { resolveWorkspaceReferences: input.resolveWorkspaceReferences }
			: {}),
		workspaceId: input.workspaceId,
	};
}

export function assertWorkspaceAccessScope(
	context: WorkspaceAccessContext,
	scope: WorkspaceAccessScope,
) {
	assertAccessScope(context, "workspace", scope);
}
