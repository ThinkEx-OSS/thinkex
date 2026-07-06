import type { KernelEventRow } from "#/features/workspaces/kernel/workspace-kernel-rows";
import { mapKernelEventRow } from "#/features/workspaces/kernel/workspace-kernel-rows";
import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";
import type {
	ListWorkspaceKernelEventsArgs,
	ListWorkspaceKernelHistoryArgs,
} from "#/features/workspaces/kernel/workspace-kernel-types";
import type {
	WorkspaceHistoryEvent,
	WorkspaceHistoryPage,
} from "#/features/workspaces/model/workspace-history";
import {
	workspaceHistoryDefaultPageSize,
	workspaceHistoryMaxPageSize,
} from "#/features/workspaces/model/workspace-history";
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

	listEventsPage({
		beforeRevision,
		limit = workspaceHistoryDefaultPageSize,
	}: ListWorkspaceKernelHistoryArgs): WorkspaceHistoryPage {
		const pageSize = Math.max(1, Math.min(limit, workspaceHistoryMaxPageSize));
		// Fetch one extra row so the cursor is only advertised when a next page exists.
		const lookahead = pageSize + 1;
		const rows =
			beforeRevision === undefined
				? this.sql<KernelEventRow>`
						SELECT *
						FROM kernel_events
						ORDER BY revision DESC
						LIMIT ${lookahead}
					`
				: this.sql<KernelEventRow>`
						SELECT *
						FROM kernel_events
						WHERE revision < ${Math.max(0, beforeRevision)}
						ORDER BY revision DESC
						LIMIT ${lookahead}
					`;
		const events = rows.slice(0, pageSize).map((row) => this.mapHistoryRow(row));

		return {
			events,
			nextBeforeRevision: rows.length > pageSize ? events[events.length - 1].revision : null,
		};
	}

	private mapHistoryRow(row: KernelEventRow): WorkspaceHistoryEvent {
		try {
			const event = mapKernelEventRow(row, this.workspaceId());

			// The payload came from JSON.parse, so it is JSON by construction.
			return { ...event, payload: event.payload as unknown as WorkspaceHistoryEvent["payload"] };
		} catch (error) {
			// Malformed payloads must never break the history view; realtime sync
			// keeps its strict parsing.
			console.warn("[WorkspaceKernel] Unable to map history event payload", {
				eventId: row.id,
				revision: row.revision,
				type: row.type,
				error,
			});

			return {
				id: row.id,
				revision: row.revision,
				workspaceId: this.workspaceId(),
				type: row.type,
				actorUserId: row.actor_user_id,
				clientMutationId: row.client_mutation_id,
				createdAt: new Date(row.created_at).toISOString(),
				payload: null,
			};
		}
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
