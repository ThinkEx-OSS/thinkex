import { DatabaseSync } from "node:sqlite";

import type { Workspace as ShellWorkspace } from "@cloudflare/shell";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Avoid pulling the Cloudflare-only observability chain into the node test env.
vi.mock("#/integrations/observability/operational-events", () => ({
	recordOperationalFailure: vi.fn(),
	recordOperationalOutcome: vi.fn(),
}));

import { WorkspaceKernelEventBus } from "#/features/workspaces/kernel/workspace-kernel-events";
import { WorkspaceKernelItemCommands } from "#/features/workspaces/kernel/workspace-kernel-item-commands";
import { WorkspaceKernelRelations } from "#/features/workspaces/kernel/workspace-kernel-relations";
import {
	initializeWorkspaceKernelStorage,
	type WorkspaceKernelSql,
} from "#/features/workspaces/kernel/workspace-kernel-schema";
import { WorkspaceKernelStore } from "#/features/workspaces/kernel/workspace-kernel-store";

const WORKSPACE_ID = "workspace-under-test";

function createTestSql(db: DatabaseSync): WorkspaceKernelSql {
	return (<T>(strings: TemplateStringsArray, ...values: (string | number | boolean | null)[]) => {
		const query = strings.join("?");
		const params = values.map((value) => (typeof value === "boolean" ? (value ? 1 : 0) : value));
		const statement = db.prepare(query);

		if (query.trim().toUpperCase().startsWith("SELECT")) {
			return statement.all(...params) as T[];
		}

		statement.run(...params);
		return [] as T[];
	}) as WorkspaceKernelSql;
}

function createItemCommands(sql: WorkspaceKernelSql) {
	const store = new WorkspaceKernelStore({ sql, workspaceId: () => WORKSPACE_ID });
	const events = new WorkspaceKernelEventBus({
		sql,
		workspaceId: () => WORKSPACE_ID,
		getNextRevision: () => store.getNextRevision(),
		broadcast: () => {},
	});
	const relations = new WorkspaceKernelRelations(sql);
	const workspace = {
		mkdir: async () => {},
		writeFile: async () => {},
	} as unknown as ShellWorkspace;

	return new WorkspaceKernelItemCommands({
		events,
		relations,
		sql,
		store,
		workspace,
		workspaceId: () => WORKSPACE_ID,
	});
}

describe("WorkspaceKernelItemCommands.createItem idempotency", () => {
	let sql: WorkspaceKernelSql;
	let commands: WorkspaceKernelItemCommands;

	beforeEach(() => {
		const db = new DatabaseSync(":memory:");
		sql = createTestSql(db);
		initializeWorkspaceKernelStorage(sql);
		commands = createItemCommands(sql);
	});

	it("treats a replayed create with the same id and clientMutationId as a no-op", async () => {
		const input = {
			id: "item-1",
			type: "document" as const,
			name: "Notes",
			clientMutationId: "mutation-1",
		};

		const first = await commands.createItem(input);
		const revisionAfterCreate = getCurrentRevision(sql);
		const second = await commands.createItem(input);

		expect(first.status).toBe("applied");
		expect(second.status).toBe("applied");
		if (first.status !== "applied" || second.status !== "applied") {
			throw new Error("Expected both creates to be applied.");
		}

		// The replay echoes the original result and event without committing a
		// new revision or inserting a second item.
		expect(second.command.result.id).toBe("item-1");
		expect(second.command.event.id).toBe(first.command.event.id);
		expect(getCurrentRevision(sql)).toBe(revisionAfterCreate);
		expect(countItems(sql, "item-1")).toBe(1);
		expect(countCreatedEvents(sql, "mutation-1")).toBe(1);
	});

	it("returns a typed id conflict when a different mutation reuses the id", async () => {
		await commands.createItem({
			id: "item-1",
			type: "document",
			name: "Notes",
			clientMutationId: "mutation-1",
		});

		const outcome = await commands.createItem({
			id: "item-1",
			type: "document",
			name: "Other",
			clientMutationId: "mutation-2",
		});

		expect(outcome.status).toBe("conflict");
		if (outcome.status !== "conflict") {
			throw new Error("Expected a conflict outcome.");
		}
		expect(outcome.conflict.code).toBe("id_conflict");
		expect(outcome.conflict.itemId).toBe("item-1");
	});
});

function getCurrentRevision(sql: WorkspaceKernelSql) {
	const [row] = sql<{ value: string }>`
		SELECT value FROM kernel_meta WHERE key = 'workspace_revision' LIMIT 1
	`;
	return Number.parseInt(row?.value ?? "0", 10) || 0;
}

function countItems(sql: WorkspaceKernelSql, id: string) {
	const [row] = sql<{ count: number }>`
		SELECT COUNT(*) AS count FROM kernel_items WHERE id = ${id}
	`;
	return row?.count ?? 0;
}

function countCreatedEvents(sql: WorkspaceKernelSql, clientMutationId: string) {
	const [row] = sql<{ count: number }>`
		SELECT COUNT(*) AS count FROM kernel_events
		WHERE client_mutation_id = ${clientMutationId} AND type = 'workspace.item.created'
	`;
	return row?.count ?? 0;
}
