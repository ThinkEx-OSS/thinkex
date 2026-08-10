import type { WorkspaceItemType } from "#/features/workspaces/contracts";

export const workspaceHistoryOrigins = ["human", "ai", "system", "restore", "import"] as const;
export type WorkspaceHistoryOrigin = (typeof workspaceHistoryOrigins)[number];

export interface WorkspaceMutationProvenance {
	groupId?: string | null;
	origin: WorkspaceHistoryOrigin;
	threadId?: string | null;
}

export interface WorkspaceHistoryItem {
	id: string;
	name: string;
	type: WorkspaceItemType;
}

export interface WorkspaceHistoryEntry {
	actor: {
		image: string | null;
		name: string;
	};
	actorUserId: string | null;
	createdAt: string;
	groupId: string | null;
	id: string;
	items: WorkspaceHistoryItem[];
	origin: WorkspaceHistoryOrigin;
	revision: number;
	threadId: string | null;
	type: string;
	versionId: string | null;
}
