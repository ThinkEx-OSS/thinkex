import { describe, expect, it } from "vitest";

import { WorkspaceKernelEventBus } from "#/features/workspaces/kernel/workspace-kernel-events";
import type { KernelEventRow } from "#/features/workspaces/kernel/workspace-kernel-rows";
import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";

function eventRow(revision: number, overrides: Partial<KernelEventRow> = {}): KernelEventRow {
	return {
		id: `event-${revision}`,
		revision,
		type: "workspace.item.created",
		actor_user_id: "user-1",
		client_mutation_id: null,
		payload_json: JSON.stringify({
			item: { id: "item-1", name: "Notes", type: "document" },
		}),
		created_at: 1_780_000_000_000 + revision,
		...overrides,
	};
}

function createEventBus(rows: KernelEventRow[]) {
	const queries: Array<{ sql: string; values: unknown[] }> = [];
	const sql: WorkspaceKernelSql = (strings, ...values) => {
		queries.push({ sql: strings.join("?"), values });
		return rows as never[];
	};
	const bus = new WorkspaceKernelEventBus({
		sql,
		workspaceId: () => "workspace-1",
		getNextRevision: () => {
			throw new Error("History reads must not advance the revision.");
		},
		broadcast: () => {
			throw new Error("History reads must not broadcast.");
		},
	});

	return { bus, queries };
}

describe("WorkspaceKernelEventBus.listEventsPage", () => {
	it("reads newest first with a lookahead row and no cursor filter by default", () => {
		const { bus, queries } = createEventBus([eventRow(3), eventRow(2), eventRow(1)]);
		const page = bus.listEventsPage({});

		expect(queries).toHaveLength(1);
		expect(queries[0].sql).toContain("ORDER BY revision DESC");
		expect(queries[0].sql).not.toContain("WHERE");
		expect(queries[0].values).toEqual([51]);
		expect(page.events.map((event) => event.revision)).toEqual([3, 2, 1]);
		expect(page.nextBeforeRevision).toBeNull();
	});

	it("filters below the cursor when one is provided", () => {
		const { bus, queries } = createEventBus([eventRow(2), eventRow(1)]);
		bus.listEventsPage({ beforeRevision: 3, limit: 10 });

		expect(queries[0].sql).toContain("WHERE revision <");
		expect(queries[0].values).toEqual([3, 11]);
	});

	it("clamps the limit between 1 and 100", () => {
		const { bus: overBus, queries: overQueries } = createEventBus([]);
		overBus.listEventsPage({ limit: 5000 });
		expect(overQueries[0].values).toEqual([101]);

		const { bus: underBus, queries: underQueries } = createEventBus([]);
		underBus.listEventsPage({ limit: 0 });
		expect(underQueries[0].values).toEqual([2]);
	});

	it("clamps a negative cursor to zero", () => {
		const { bus, queries } = createEventBus([]);
		bus.listEventsPage({ beforeRevision: -5 });

		expect(queries[0].values[0]).toBe(0);
	});

	it("advertises the next cursor only when the lookahead row exists", () => {
		const { bus } = createEventBus([eventRow(5), eventRow(4), eventRow(3)]);
		const page = bus.listEventsPage({ limit: 2 });

		expect(page.events.map((event) => event.revision)).toEqual([5, 4]);
		expect(page.nextBeforeRevision).toBe(4);

		const { bus: lastBus } = createEventBus([eventRow(2), eventRow(1)]);
		const lastPage = lastBus.listEventsPage({ limit: 2 });

		expect(lastPage.events.map((event) => event.revision)).toEqual([2, 1]);
		expect(lastPage.nextBeforeRevision).toBeNull();
	});

	it("maps rows through the shared event mapper", () => {
		const { bus } = createEventBus([eventRow(7)]);
		const [event] = bus.listEventsPage({}).events;

		expect(event).toMatchObject({
			id: "event-7",
			revision: 7,
			workspaceId: "workspace-1",
			type: "workspace.item.created",
			actorUserId: "user-1",
			payload: { item: { id: "item-1", name: "Notes", type: "document" } },
		});
		expect(event.createdAt).toBe(new Date(1_780_000_000_007).toISOString());
	});

	it("degrades malformed payload rows instead of failing the page", () => {
		const { bus } = createEventBus([eventRow(9), eventRow(8, { payload_json: "{not json" })]);
		const page = bus.listEventsPage({});

		expect(page.events).toHaveLength(2);
		expect(page.events[1]).toMatchObject({
			id: "event-8",
			revision: 8,
			payload: null,
		});
	});
});
