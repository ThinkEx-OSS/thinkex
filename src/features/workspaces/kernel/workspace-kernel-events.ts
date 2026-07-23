import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";
import type {
	WorkspaceRealtimeEvent,
	WorkspaceRealtimeServerMessage,
} from "#/features/workspaces/realtime/messages";

export class WorkspaceKernelEventBus {
	private readonly sql: WorkspaceKernelSql;
	private readonly workspaceId: () => string;
	private readonly getNextRevision: () => number;
	private readonly broadcast: (message: WorkspaceRealtimeServerMessage) => void;

	constructor(input: {
		sql: WorkspaceKernelSql;
		workspaceId: () => string;
		getNextRevision: () => number;
		broadcast: (message: WorkspaceRealtimeServerMessage) => void;
	}) {
		this.sql = input.sql;
		this.workspaceId = input.workspaceId;
		this.getNextRevision = input.getNextRevision;
		this.broadcast = input.broadcast;
	}

	commit(input: Omit<WorkspaceRealtimeEvent, "id" | "revision" | "workspaceId" | "createdAt">) {
		const createdAt = Date.now();
		const event = {
			id: crypto.randomUUID(),
			revision: this.getNextRevision(),
			workspaceId: this.workspaceId(),
			createdAt: new Date(createdAt).toISOString(),
			...input,
		} as WorkspaceRealtimeEvent;

		this.sql`
			INSERT INTO kernel_events (
				id,
				revision,
				type,
				actor_user_id,
				client_mutation_id,
				payload_json,
				created_at
			)
			VALUES (
				${event.id},
				${event.revision},
				${event.type},
				${event.actorUserId},
				${event.clientMutationId},
				${JSON.stringify(event.payload)},
				${createdAt}
			)
		`;
		this.broadcast({
			type: "workspace.event",
			workspaceId: this.workspaceId(),
			event,
		});

		return event;
	}

	// Look up a previously committed event by its client mutation id so a
	// retried/replayed mutation RPC can be treated as a no-op that echoes the
	// original result instead of re-running the command.
	findCommittedEvent(input: {
		clientMutationId: string;
		type: WorkspaceRealtimeEvent["type"];
	}): WorkspaceRealtimeEvent | null {
		const [row] = this.sql<{
			id: string;
			revision: number;
			type: string;
			actor_user_id: string | null;
			client_mutation_id: string | null;
			payload_json: string;
			created_at: number;
		}>`
			SELECT id, revision, type, actor_user_id, client_mutation_id, payload_json, created_at
			FROM kernel_events
			WHERE client_mutation_id = ${input.clientMutationId} AND type = ${input.type}
			ORDER BY revision ASC
			LIMIT 1
		`;

		if (!row) {
			return null;
		}

		return {
			id: row.id,
			revision: row.revision,
			workspaceId: this.workspaceId(),
			createdAt: new Date(row.created_at).toISOString(),
			actorUserId: row.actor_user_id,
			clientMutationId: row.client_mutation_id,
			type: row.type,
			payload: JSON.parse(row.payload_json),
		} as WorkspaceRealtimeEvent;
	}
}
