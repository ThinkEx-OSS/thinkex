import type { KernelEventRow } from "#/features/workspaces/kernel/workspace-kernel-rows";
import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";
import type { WorkspaceItemFacts, WorkspaceItemSummary } from "#/features/workspaces/contracts";
import type {
	WorkspaceRealtimeEvent,
	WorkspaceRealtimeServerMessage,
} from "#/features/workspaces/realtime/messages";

type WorkspaceKernelEventIdentity = Pick<
	WorkspaceRealtimeEvent,
	"actorUserId" | "clientMutationId" | "createdAt" | "id" | "revision" | "workspaceId"
>;

type MutationReceiptEventRow = KernelEventRow & { result_id: string };

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

	commit(
		input: Omit<WorkspaceRealtimeEvent, "id" | "revision" | "workspaceId" | "createdAt">,
		receipt?: { resultId: string },
	) {
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
		if (event.clientMutationId && receipt) {
			this.sql`
				INSERT INTO kernel_mutation_receipts (
					client_mutation_id,
					result_id,
					event_id,
					created_at
				)
				VALUES (
					${event.clientMutationId},
					${receipt.resultId},
					${event.id},
					${createdAt}
				)
			`;
		}
		this.broadcast({
			type: "workspace.event",
			workspaceId: this.workspaceId(),
			event,
		});

		return event;
	}

	findMutationEvent(input: {
		clientMutationId: string;
		eventType: WorkspaceRealtimeEvent["type"];
		resultId: string;
	}) {
		const [row] = this.sql<MutationReceiptEventRow>`
			SELECT kernel_events.*, kernel_mutation_receipts.result_id
			FROM kernel_mutation_receipts
			INNER JOIN kernel_events ON kernel_events.id = kernel_mutation_receipts.event_id
			WHERE kernel_mutation_receipts.client_mutation_id = ${input.clientMutationId}
			LIMIT 1
		`;
		if (!row) {
			return null;
		}
		if (row.type !== input.eventType || row.result_id !== input.resultId) {
			throw new Error("Workspace client mutation id was already used.");
		}
		return mapEventIdentity(row, this.workspaceId());
	}
}

export function hydrateCreatedItemEvent(
	event: WorkspaceKernelEventIdentity,
	item: WorkspaceItemSummary,
	itemFacts: WorkspaceItemFacts[],
): Extract<WorkspaceRealtimeEvent, { type: "workspace.item.created" }> {
	return {
		...event,
		type: "workspace.item.created",
		payload: { item, itemFacts },
	};
}

export function hydrateProjectionEvent(
	event: WorkspaceKernelEventIdentity,
	itemFacts: WorkspaceItemFacts[],
): Extract<WorkspaceRealtimeEvent, { type: "workspace.item.projection.updated" }> {
	return {
		...event,
		type: "workspace.item.projection.updated",
		payload: { itemFacts },
	};
}

function mapEventIdentity(row: KernelEventRow, workspaceId: string): WorkspaceKernelEventIdentity {
	return {
		actorUserId: row.actor_user_id,
		clientMutationId: row.client_mutation_id,
		createdAt: new Date(row.created_at).toISOString(),
		id: row.id,
		revision: row.revision,
		workspaceId,
	};
}
