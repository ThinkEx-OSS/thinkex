import { describe, expect, it, vi } from "vitest";

import {
	hydrateCreatedItemEvent,
	hydrateProjectionEvent,
	WorkspaceKernelEventBus,
} from "#/features/workspaces/kernel/workspace-kernel-events";
import type { KernelEventRow } from "#/features/workspaces/kernel/workspace-kernel-rows";
import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";

describe("workspace kernel event idempotency", () => {
	it("recovers a committed item creation by client mutation id", () => {
		const events = createEventBus(createItemEventRow("item-1"));

		expect(
			events.findMutationEvent({
				clientMutationId: "mutation-1",
				eventType: "workspace.item.created",
				resultId: "item-1",
			}),
		).toMatchObject({
			clientMutationId: "mutation-1",
			id: "event-1",
			revision: 1,
		});
	});

	it("records a mutation receipt beside an idempotent event", () => {
		const statements: string[] = [];
		const sql: WorkspaceKernelSql = (strings) => {
			statements.push(strings.join(" "));
			return [];
		};
		const events = new WorkspaceKernelEventBus({
			broadcast: vi.fn(),
			getNextRevision: () => 1,
			sql,
			workspaceId: () => "workspace-1",
		});

		events.commit(
			{
				actorUserId: null,
				clientMutationId: "mutation-1",
				payload: { item: createItem(), itemFacts: [] },
				type: "workspace.item.created",
			},
			{ resultId: "item-1" },
		);

		expect(statements.some((statement) => statement.includes("kernel_mutation_receipts"))).toBe(
			true,
		);
	});

	it("hydrates historical creation events with the current payload shape", () => {
		const events = createEventBus(createItemEventRow("item-1"));
		const storedEvent = events.findMutationEvent({
			clientMutationId: "mutation-1",
			eventType: "workspace.item.created",
			resultId: "item-1",
		});
		if (!storedEvent) {
			throw new Error("Expected a stored creation event.");
		}
		const item = createItem();

		expect(hydrateCreatedItemEvent(storedEvent, item, [])).toMatchObject({
			payload: { item, itemFacts: [] },
			type: "workspace.item.created",
		});
	});

	it("rejects reuse of a client mutation id for another item", () => {
		const events = createEventBus(createItemEventRow("item-1"));

		expect(() =>
			events.findMutationEvent({
				clientMutationId: "mutation-1",
				eventType: "workspace.item.created",
				resultId: "item-2",
			}),
		).toThrow("client mutation id was already used");
	});

	it("recovers and hydrates a committed projection update", () => {
		const events = createEventBus(createProjectionEventRow("item-1"));
		const storedEvent = events.findMutationEvent({
			clientMutationId: "mutation-1",
			eventType: "workspace.item.projection.updated",
			resultId: "item-1",
		});
		if (!storedEvent) {
			throw new Error("Expected a stored projection event.");
		}
		const itemFacts = [{ itemId: "item-1", pageCount: 3, relationshipCount: 0 }];

		expect(hydrateProjectionEvent(storedEvent, itemFacts)).toMatchObject({
			clientMutationId: "mutation-1",
			payload: { itemFacts },
			type: "workspace.item.projection.updated",
		});
	});
});

function createEventBus(row: KernelEventRow & { result_id: string }) {
	const sql = vi.fn(() => [row]) as unknown as WorkspaceKernelSql;
	return new WorkspaceKernelEventBus({
		broadcast: vi.fn(),
		getNextRevision: () => 2,
		sql,
		workspaceId: () => "workspace-1",
	});
}

function createProjectionEventRow(itemId: string): KernelEventRow & { result_id: string } {
	return {
		actor_user_id: null,
		client_mutation_id: "mutation-1",
		created_at: Date.parse("2026-07-15T00:00:00Z"),
		id: "event-1",
		payload_json: "{}",
		revision: 1,
		result_id: itemId,
		type: "workspace.item.projection.updated",
	};
}

function createItemEventRow(itemId: string): KernelEventRow & { result_id: string } {
	return {
		actor_user_id: "user-1",
		client_mutation_id: "mutation-1",
		created_at: Date.parse("2026-07-15T00:00:00Z"),
		id: "event-1",
		payload_json: "{}",
		revision: 1,
		result_id: itemId,
		type: "workspace.item.created",
	};
}

function createItem() {
	return {
		color: null,
		createdAt: "2026-07-15T00:00:00.000Z",
		deletedAt: null,
		id: "item-1",
		meta: "Document",
		metadataJson: {},
		name: "Notes",
		parentId: null,
		sortOrder: 1,
		title: "Notes",
		type: "document" as const,
		updatedAt: "2026-07-15T00:00:00.000Z",
		workspaceId: "workspace-1",
	};
}
