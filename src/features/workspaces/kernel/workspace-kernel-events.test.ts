import { describe, expect, it, vi } from "vitest";

import { WorkspaceKernelEventBus } from "#/features/workspaces/kernel/workspace-kernel-events";
import type { KernelEventRow } from "#/features/workspaces/kernel/workspace-kernel-rows";
import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";

describe("workspace kernel event idempotency", () => {
	it("recovers a committed item creation by client mutation id", () => {
		const events = createEventBus(createItemEventRow("item-1"));

		expect(
			events.getCreatedItemEvent({
				clientMutationId: "mutation-1",
				itemId: "item-1",
			}),
		).toMatchObject({
			clientMutationId: "mutation-1",
			payload: { item: { id: "item-1" } },
			type: "workspace.item.created",
		});
	});

	it("rejects reuse of a client mutation id for another item", () => {
		const events = createEventBus(createItemEventRow("item-1"));

		expect(() =>
			events.getCreatedItemEvent({
				clientMutationId: "mutation-1",
				itemId: "item-2",
			}),
		).toThrow("client mutation id was already used");
	});
});

function createEventBus(row: KernelEventRow) {
	const sql = vi.fn(() => [row]) as unknown as WorkspaceKernelSql;
	return new WorkspaceKernelEventBus({
		broadcast: vi.fn(),
		getNextRevision: () => 2,
		sql,
		workspaceId: () => "workspace-1",
	});
}

function createItemEventRow(itemId: string): KernelEventRow {
	return {
		actor_user_id: "user-1",
		client_mutation_id: "mutation-1",
		created_at: Date.parse("2026-07-15T00:00:00Z"),
		id: "event-1",
		payload_json: JSON.stringify({ item: { id: itemId } }),
		revision: 1,
		type: "workspace.item.created",
	};
}
