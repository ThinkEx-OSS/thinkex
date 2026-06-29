import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";

export interface WorkspacePresenceUser {
	id: string;
	connectionId: string;
	name: string;
	image: string | null;
}

interface WorkspaceRealtimeEventBase {
	id: string;
	revision: number;
	workspaceId: string;
	createdAt: string;
	actorUserId: string | null;
	clientMutationId: string | null;
}

export type WorkspaceRealtimeEvent =
	| (WorkspaceRealtimeEventBase & {
			type:
				| "workspace.item.created"
				| "workspace.item.renamed"
				| "workspace.item.moved"
				| "workspace.item.color.updated"
				| "workspace.item.content.updated";
			payload: { item: WorkspaceItemSummary };
	  })
	| (WorkspaceRealtimeEventBase & {
			type: "workspace.items.moved";
			payload: { items: WorkspaceItemSummary[] };
	  })
	| (WorkspaceRealtimeEventBase & {
			type: "workspace.item.deleted";
			payload: { itemIds: string[]; deletedItemIds: string[] };
	  });

export interface WorkspaceCommandResult<T> {
	result: T;
	event: WorkspaceRealtimeEvent;
}

export type WorkspaceRealtimeServerMessage =
	| {
			type: "presence.snapshot";
			workspaceId: string;
			users: WorkspacePresenceUser[];
	  }
	| {
			type: "workspace.event";
			workspaceId: string;
			event: WorkspaceRealtimeEvent;
	  };

export interface WorkspaceConnectionState {
	user: Omit<WorkspacePresenceUser, "connectionId">;
}
