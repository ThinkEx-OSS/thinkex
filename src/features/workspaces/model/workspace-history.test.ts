import { describe, expect, it } from "vitest";

import type { JsonValue } from "#/features/workspaces/contracts";
import {
	mapWorkspaceHistoryEvents,
	type WorkspaceHistoryEvent,
} from "#/features/workspaces/model/workspace-history";

let nextRevision = 1000;

function historyEvent(input: {
	type: string;
	payload?: JsonValue;
	actorUserId?: string | null;
	createdAt?: string;
	revision?: number;
}): WorkspaceHistoryEvent {
	const revision = input.revision ?? nextRevision--;

	return {
		id: `event-${revision}`,
		revision,
		workspaceId: "workspace-1",
		type: input.type,
		actorUserId: input.actorUserId === undefined ? "user-1" : input.actorUserId,
		clientMutationId: null,
		createdAt: input.createdAt ?? "2026-07-04T12:00:00.000Z",
		payload: input.payload ?? null,
	};
}

function payloadItem(overrides: Partial<{ id: string; name: string; type: string }> = {}) {
	return {
		id: "item-1",
		name: "Notes",
		type: "document",
		...overrides,
	};
}

describe("mapWorkspaceHistoryEvents", () => {
	it("maps every known event type to readable copy", () => {
		const entries = mapWorkspaceHistoryEvents([
			historyEvent({
				type: "workspace.item.created",
				payload: { item: payloadItem({ type: "folder", name: "Research" }) },
			}),
			historyEvent({
				type: "workspace.item.renamed",
				payload: { item: payloadItem({ name: "Final notes" }) },
			}),
			historyEvent({
				type: "workspace.item.moved",
				payload: { item: payloadItem({ name: "Final notes" }) },
			}),
			historyEvent({
				type: "workspace.item.color.updated",
				payload: { item: payloadItem({ type: "folder", name: "Research" }) },
			}),
			historyEvent({
				type: "workspace.item.content.updated",
				payload: { item: payloadItem() },
			}),
			historyEvent({
				type: "workspace.item.deleted",
				payload: { itemIds: ["item-1"], deletedItemIds: ["item-1", "item-2"] },
			}),
		]);

		expect(entries.map((entry) => [entry.kind, entry.summary])).toEqual([
			["created", "created folder “Research”"],
			["renamed", "renamed document to “Final notes”"],
			["moved", "moved “Final notes”"],
			["color", "changed the color of “Research”"],
			["edited", "edited “Notes”"],
			["deleted", "deleted an item"],
		]);
	});

	it("renders bulk moves as one grouped row", () => {
		const entries = mapWorkspaceHistoryEvents([
			historyEvent({
				type: "workspace.items.moved",
				payload: {
					items: [
						payloadItem({ id: "item-1", name: "A" }),
						payloadItem({ id: "item-2", name: "B" }),
						payloadItem({ id: "item-3", name: "C" }),
					],
				},
			}),
		]);

		expect(entries).toHaveLength(1);
		expect(entries[0].summary).toBe("moved 3 items");
	});

	it("renders a single-item bulk move like a plain move", () => {
		const entries = mapWorkspaceHistoryEvents([
			historyEvent({
				type: "workspace.items.moved",
				payload: { items: [payloadItem({ name: "A" })] },
			}),
		]);

		expect(entries[0].summary).toBe("moved “A”");
	});

	it("counts deleted items from the root item ids", () => {
		const entries = mapWorkspaceHistoryEvents([
			historyEvent({
				type: "workspace.item.deleted",
				payload: { itemIds: ["item-1", "item-2"], deletedItemIds: ["item-1", "item-2", "item-3"] },
			}),
		]);

		expect(entries[0].summary).toBe("deleted 2 items");
	});

	it("coalesces consecutive edits to the same item by the same actor", () => {
		const entries = mapWorkspaceHistoryEvents([
			historyEvent({
				type: "workspace.item.content.updated",
				payload: { item: payloadItem() },
				createdAt: "2026-07-04T12:04:00.000Z",
				revision: 12,
			}),
			historyEvent({
				type: "workspace.item.content.updated",
				payload: { item: payloadItem() },
				createdAt: "2026-07-04T12:02:00.000Z",
				revision: 11,
			}),
			historyEvent({
				type: "workspace.item.content.updated",
				payload: { item: payloadItem() },
				createdAt: "2026-07-04T12:00:00.000Z",
				revision: 10,
			}),
		]);

		expect(entries).toHaveLength(1);
		expect(entries[0].summary).toBe("edited “Notes” (3 changes)");
		expect(entries[0].eventCount).toBe(3);
		expect(entries[0].revision).toBe(12);
		expect(entries[0].createdAt).toBe("2026-07-04T12:04:00.000Z");
	});

	it("groups unattributed collaborative edits together", () => {
		const entries = mapWorkspaceHistoryEvents([
			historyEvent({
				type: "workspace.item.content.updated",
				payload: { item: payloadItem() },
				actorUserId: null,
				createdAt: "2026-07-04T12:01:00.000Z",
			}),
			historyEvent({
				type: "workspace.item.content.updated",
				payload: { item: payloadItem() },
				actorUserId: null,
				createdAt: "2026-07-04T12:00:00.000Z",
			}),
		]);

		expect(entries).toHaveLength(1);
		expect(entries[0].actorUserId).toBeNull();
	});

	it("splits edit bursts across actors, items, gaps, and other events", () => {
		const editAt = (createdAt: string, actorUserId: string | null = "user-1") =>
			historyEvent({
				type: "workspace.item.content.updated",
				payload: { item: payloadItem() },
				createdAt,
				actorUserId,
			});

		const differentActor = mapWorkspaceHistoryEvents([
			editAt("2026-07-04T12:01:00.000Z"),
			editAt("2026-07-04T12:00:00.000Z", "user-2"),
		]);
		expect(differentActor).toHaveLength(2);

		const differentItem = mapWorkspaceHistoryEvents([
			editAt("2026-07-04T12:01:00.000Z"),
			historyEvent({
				type: "workspace.item.content.updated",
				payload: { item: payloadItem({ id: "item-2", name: "Other" }) },
				createdAt: "2026-07-04T12:00:00.000Z",
			}),
		]);
		expect(differentItem).toHaveLength(2);

		const longGap = mapWorkspaceHistoryEvents([
			editAt("2026-07-04T12:10:00.000Z"),
			editAt("2026-07-04T12:00:00.000Z"),
		]);
		expect(longGap).toHaveLength(2);

		const interleaved = mapWorkspaceHistoryEvents([
			editAt("2026-07-04T12:02:00.000Z"),
			historyEvent({
				type: "workspace.item.renamed",
				payload: { item: payloadItem() },
				createdAt: "2026-07-04T12:01:00.000Z",
			}),
			editAt("2026-07-04T12:00:00.000Z"),
		]);
		expect(interleaved).toHaveLength(3);
	});

	it("renders unknown event types as a generic change row", () => {
		const entries = mapWorkspaceHistoryEvents([
			historyEvent({ type: "workspace.item.starred", payload: { anything: true } }),
		]);

		expect(entries[0].kind).toBe("change");
		expect(entries[0].summary).toBe("made a change");
	});

	it("never throws on malformed payloads", () => {
		const entries = mapWorkspaceHistoryEvents([
			historyEvent({ type: "workspace.item.created", payload: null }),
			historyEvent({ type: "workspace.item.renamed", payload: { item: "not-an-object" } }),
			historyEvent({ type: "workspace.items.moved", payload: { items: "nope" } }),
			historyEvent({ type: "workspace.item.deleted", payload: {} }),
			historyEvent({ type: "workspace.item.content.updated", payload: 42 }),
		]);

		expect(entries.map((entry) => entry.summary)).toEqual([
			"created an item",
			"renamed an item",
			"moved items",
			"deleted items",
			"edited an item",
		]);
	});
});
