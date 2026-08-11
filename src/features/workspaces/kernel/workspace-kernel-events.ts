import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";
import type { WorkspaceMutationProvenance } from "#/features/workspaces/history/workspace-history-contract";
import type {
	WorkspaceRealtimeEvent,
	WorkspaceRealtimeServerMessage,
} from "#/features/workspaces/realtime/messages";

export class WorkspaceKernelEventBus {
	private readonly sql: WorkspaceKernelSql;
	private readonly workspaceId: () => string;
	private readonly getNextRevision: () => number;
	private readonly broadcast: (message: WorkspaceRealtimeServerMessage) => void;
	private readonly onCommit?: (event: WorkspaceRealtimeEvent) => void;

	constructor(input: {
		sql: WorkspaceKernelSql;
		workspaceId: () => string;
		getNextRevision: () => number;
		broadcast: (message: WorkspaceRealtimeServerMessage) => void;
		onCommit?: (event: WorkspaceRealtimeEvent) => void;
	}) {
		this.sql = input.sql;
		this.workspaceId = input.workspaceId;
		this.getNextRevision = input.getNextRevision;
		this.broadcast = input.broadcast;
		this.onCommit = input.onCommit;
	}

	commit(
		input: Omit<
			WorkspaceRealtimeEvent,
			"id" | "revision" | "workspaceId" | "createdAt" | "origin" | "groupId" | "threadId"
		> & { provenance?: WorkspaceMutationProvenance },
		options: {
			onPersist?: (event: WorkspaceRealtimeEvent) => void;
			persist?: boolean;
		} = {},
	) {
		const createdAt = Date.now();
		const provenance = input.provenance;
		const event = {
			id: crypto.randomUUID(),
			revision: this.getNextRevision(),
			workspaceId: this.workspaceId(),
			createdAt: new Date(createdAt).toISOString(),
			...input,
			origin: provenance?.origin ?? (input.actorUserId ? "human" : "system"),
			groupId: provenance?.groupId ?? null,
			threadId: provenance?.threadId ?? null,
		} as WorkspaceRealtimeEvent;
		Reflect.deleteProperty(event, "provenance");

		if (options.persist !== false) {
			this.sql`
			INSERT INTO kernel_events (
				id,
				revision,
				type,
				actor_user_id,
				client_mutation_id,
					origin,
					group_id,
					thread_id,
					payload_json,
				created_at
			)
			VALUES (
				${event.id},
				${event.revision},
				${event.type},
				${event.actorUserId},
				${event.clientMutationId},
					${event.origin},
					${event.groupId},
					${event.threadId},
					${JSON.stringify(event.payload)},
				${createdAt}
			)
		`;
			options.onPersist?.(event);
		}
		this.onCommit?.(event);
		this.broadcast({
			type: "workspace.event",
			workspaceId: this.workspaceId(),
			event,
		});

		return event;
	}
}
