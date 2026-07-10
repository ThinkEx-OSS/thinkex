import { describe, expect, it, vi } from "vitest";

import { WorkspaceKernelItemCommands } from "#/features/workspaces/kernel/workspace-kernel-item-commands";
import type { KernelItemRow } from "#/features/workspaces/kernel/workspace-kernel-rows";

function makeItemRow(id: string): KernelItemRow {
	return {
		id,
		parent_id: null,
		type: "document",
		name: id,
		color: null,
		metadata_json: "{}",
		sort_order: 0,
		shell_path: `/${id}`,
		created_at: 0,
		updated_at: 0,
		deleted_at: null,
	};
}

describe("WorkspaceKernelItemCommands.deleteItems", () => {
	it("streams file removals in bounded batches instead of all at once", async () => {
		const itemIds = Array.from({ length: 9 }, (_, index) => `item-${index}`);
		const rowsById = new Map(itemIds.map((id) => [id, makeItemRow(id)]));

		let inFlight = 0;
		let maxInFlight = 0;
		const rm = vi.fn(async () => {
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 1));
			inFlight -= 1;
		});

		const store = {
			assertActiveItem: (id: string) => rowsById.get(id),
			getItemRowIncludingDeleted: (id: string) => rowsById.get(id) ?? null,
			getDescendantIds: () => [],
			softDeleteItems: vi.fn(),
		};
		const relations = { deleteRelationsForItems: vi.fn() };
		const events = { commit: vi.fn(() => ({ id: "event" })) };
		const workspace = { rm };

		const commands = new WorkspaceKernelItemCommands({
			events: events as never,
			relations: relations as never,
			sql: (() => []) as never,
			store: store as never,
			workspace: workspace as never,
			workspaceId: () => "workspace",
		});

		const { result } = await commands.deleteItems({ itemIds });

		expect(rm).toHaveBeenCalledTimes(9);
		expect(maxInFlight).toBeLessThanOrEqual(4);
		expect(maxInFlight).toBeGreaterThan(1);
		expect(result.deletedItemIds).toEqual(itemIds);
		expect(store.softDeleteItems).toHaveBeenCalledWith(itemIds, expect.any(Number));
	});
});
