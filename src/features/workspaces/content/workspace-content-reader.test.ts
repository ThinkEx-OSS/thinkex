import { describe, expect, it, vi } from "vitest";

import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import type { DocumentSessionClient } from "#/features/workspaces/document-session-access";
import type { WorkspaceKernelClient } from "#/features/workspaces/kernel/workspace-kernel-access";
import type { WorkspaceKernelPathResolution } from "#/features/workspaces/kernel/workspace-kernel-types";
import { createWorkspaceContentReader } from "#/features/workspaces/content/workspace-content-reader";

const documentItem: WorkspaceItemSummary = {
	id: "document-1",
	workspaceId: "workspace-1",
	parentId: null,
	type: "document",
	title: "Notes",
	name: "Notes",
	meta: "Document",
	color: null,
	metadataJson: {},
	sortOrder: 1,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	deletedAt: null,
};

describe("WorkspaceContentReader", () => {
	it("continues a large live document with a revision-guarded cursor", async () => {
		const markdown = Array.from({ length: 20_000 }, (_, index) => `line ${index + 1}`).join("\n");
		const session = createDocumentSession({ markdown, revision: "revision-1" });
		const reader = createWorkspaceContentReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => session,
			kernel: createKernel(),
		});

		const [first] = await reader.read([{ mode: "start", path: "/Notes" }]);
		expect(first).toMatchObject({
			format: "markdown",
			location: { kind: "lines", startLine: 1, totalLines: 20_000 },
			path: "/Notes",
			status: "ready",
			type: "document",
		});
		if (
			!first ||
			first.status !== "ready" ||
			first.location.kind !== "lines" ||
			!first.nextCursor
		) {
			throw new Error("Expected the first document chunk to have a continuation cursor.");
		}

		const [second] = await reader.read([
			{ cursor: first.nextCursor, mode: "continue", path: "/Notes" },
		]);
		expect(second).toMatchObject({
			location: { kind: "lines" },
			path: "/Notes",
			status: "ready",
			type: "document",
		});
		if (!second || second.status !== "ready" || second.location.kind !== "lines") {
			throw new Error("Expected a continued document chunk.");
		}
		expect(second.location.startLine).toBeGreaterThan(first.location.startLine);
	});

	it("rejects continuation when the live document revision changed", async () => {
		const session = createDocumentSession({
			markdown: "a\n".repeat(40_000),
			revision: "revision-1",
		});
		const reader = createWorkspaceContentReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => session,
			kernel: createKernel(),
		});
		const [first] = await reader.read([{ mode: "start", path: "/Notes" }]);
		if (!first || first.status !== "ready" || !first.nextCursor) {
			throw new Error("Expected a continuation cursor.");
		}

		session.readMarkdown = vi.fn(async () => ({ markdown: "changed", revision: "revision-2" }));
		await expect(
			reader.read([{ cursor: first.nextCursor, mode: "continue", path: "/Notes" }]),
		).resolves.toEqual([{ code: "content_changed", path: "/Notes", status: "failed" }]);
	});

	it("keeps one ordered result for every requested path", async () => {
		const kernel = createKernel();
		kernel.resolvePaths = vi.fn(
			async () =>
				[
					{ code: "path_not_absolute", path: "Notes", status: "invalid_path" },
					{ path: "/Missing", status: "not_found" },
					{ path: "/", status: "root" },
				] satisfies WorkspaceKernelPathResolution[],
		);
		const reader = createWorkspaceContentReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => createDocumentSession({ markdown: "", revision: "revision-1" }),
			kernel,
		});

		await expect(
			reader.read([
				{ mode: "start", path: "Notes" },
				{ mode: "start", path: "/Missing" },
				{ mode: "start", path: "/" },
			]),
		).resolves.toEqual([
			{ code: "path_not_absolute", path: "Notes", status: "failed" },
			{ code: "path_not_found", path: "/Missing", status: "failed" },
			{ code: "path_is_folder", path: "/", status: "failed" },
		]);
	});
});

function createDocumentSession(snapshot: { markdown: string; revision: string }) {
	return {
		readMarkdown: vi.fn(async () => snapshot),
	} as unknown as DocumentSessionClient;
}

function createKernel() {
	return {
		resolvePaths: vi.fn(async ({ paths }: { paths: string[] }) =>
			paths.map((path) => ({ item: documentItem, path, status: "item" as const })),
		),
		listItemRelations: vi.fn(async () => []),
		getItemPaths: vi.fn(async () => [{ itemId: documentItem.id, path: "/Notes" }]),
	} as unknown as WorkspaceKernelClient;
}
