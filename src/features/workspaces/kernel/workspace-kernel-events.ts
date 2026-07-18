import { z } from "zod";
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

const storedCreatedItemPayloadSchema = z.object({
	item: z.object({ id: z.string() }),
});

const storedProjectionPayloadSchema = z.object({
	itemFacts: z.array(z.object({ itemId: z.string() })),
});

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

	findCreatedItemEvent(input: { clientMutationId: string; itemId: string }) {
		const row = this.findEventRow("workspace.item.created", input.clientMutationId);
		if (!row) {
			return null;
		}

		const payload = storedCreatedItemPayloadSchema.parse(JSON.parse(row.payload_json));
		if (payload.item.id !== input.itemId) {
			throw new Error("Workspace client mutation id was already used.");
		}

		return mapEventIdentity(row, this.workspaceId());
	}

	findProjectionEvent(input: { clientMutationId: string; itemId: string }) {
		const row = this.findEventRow("workspace.item.projection.updated", input.clientMutationId);
		if (!row) {
			return null;
		}
		const payload = storedProjectionPayloadSchema.parse(JSON.parse(row.payload_json));
		if (!payload.itemFacts.some((facts) => facts.itemId === input.itemId)) {
			throw new Error("Workspace client mutation id was already used.");
		}

		return mapEventIdentity(row, this.workspaceId());
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

	private findEventRow(type: WorkspaceRealtimeEvent["type"], clientMutationId: string) {
		const [row] = this.sql<KernelEventRow>`
			SELECT *
			FROM kernel_events
			WHERE type = ${type}
				AND client_mutation_id = ${clientMutationId}
			ORDER BY revision ASC
			LIMIT 1
		`;
		return row ?? null;
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
