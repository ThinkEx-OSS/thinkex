import type { KernelEventRow } from "#/features/workspaces/kernel/workspace-kernel-rows";
import { mapKernelEventRow } from "#/features/workspaces/kernel/workspace-kernel-rows";
import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";
import type { ListWorkspaceKernelEventsArgs } from "#/features/workspaces/kernel/workspace-kernel-types";
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

	getEventsSince({
		afterRevision,
		limit = 100,
	}: ListWorkspaceKernelEventsArgs): WorkspaceRealtimeEvent[] {
		const rows = this.sql<KernelEventRow>`
			SELECT *
			FROM kernel_events
			WHERE revision > ${Math.max(0, afterRevision)}
			ORDER BY revision ASC
			LIMIT ${Math.max(1, Math.min(limit, 500))}
		`;

		return rows.map((row) => mapKernelEventRow(row, this.workspaceId()));
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
}
