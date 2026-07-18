import { describe, expect, it, vi } from "vitest";

import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import type { WorkspaceContentReadRequest } from "#/features/workspaces/content/workspace-content-contract";
import { createDocumentMarkdownSnapshot } from "#/features/workspaces/documents/document-markdown-chunk";
import type { WorkspaceKernelClient } from "#/features/workspaces/kernel/workspace-kernel-access";
import type { WorkspaceKernelPathResolution } from "#/features/workspaces/kernel/workspace-kernel-types";
import { createWorkspaceContentReader } from "#/features/workspaces/content/workspace-content-reader";
import { encodeWorkspaceContentCursor } from "#/features/workspaces/content/workspace-content-cursor";

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

		session.readMarkdownChunk = vi.fn(async () => ({ status: "content_changed" }));
		await expect(
			reader.read([{ cursor: first.nextCursor, mode: "continue", path: "/Notes" }]),
		).resolves.toEqual([{ code: "content_changed", path: "/Notes", status: "failed" }]);
	});

	it("preserves document whitespace across chunk boundaries", async () => {
		const markdown = `heading  \n\n    indented code\n${"x".repeat(64_000)}\n`;
		const reader = createWorkspaceContentReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => createDocumentSession({ markdown, revision: "revision-1" }),
			kernel: createKernel(),
		});

		const contents: string[] = [];
		let request: WorkspaceContentReadRequest = { mode: "start", path: "/Notes" };
		for (;;) {
			const [result] = await reader.read([request]);
			expect(result).toMatchObject({ status: "ready", type: "document" });
			if (!result || result.status !== "ready") {
				throw new Error("Expected a document chunk.");
			}
			contents.push(result.content);
			if (!result.nextCursor) {
				break;
			}
			request = { cursor: result.nextCursor, mode: "continue", path: "/Notes" };
		}
		expect(contents.join("")).toBe(markdown);
	});

	it("rejects a nonzero continuation offset for an empty document", async () => {
		const reader = createWorkspaceContentReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => createDocumentSession({ markdown: "", revision: "revision-1" }),
			kernel: createKernel(),
		});
		const cursor = encodeWorkspaceContentCursor({
			itemId: documentItem.id,
			kind: "document",
			offset: 1,
			revision: "revision-1",
			version: 1,
		});

		await expect(reader.read([{ cursor, mode: "continue", path: "/Notes" }])).resolves.toEqual([
			{ code: "invalid_cursor", path: "/Notes", status: "failed" },
		]);
	});

	it("bounds total content returned by a batch", async () => {
		const reader = createWorkspaceContentReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () =>
				createDocumentSession({ markdown: "😀".repeat(40_000), revision: "revision-1" }),
			kernel: createKernel(),
		});
		const requests = Array.from({ length: 20 }, (_, index) => ({
			mode: "start" as const,
			path: `/Notes ${index + 1}`,
		}));

		const results = await reader.read(requests);
		expect(results.filter((result) => result.status === "ready")).toHaveLength(16);
		expect(results.slice(16)).toEqual(
			requests.slice(16).map((request) => ({
				code: "read_budget_exceeded",
				path: request.path,
				status: "failed",
			})),
		);
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
		readMarkdownChunk: vi.fn(async ({ expectedRevision, offset }) => {
			if (expectedRevision && expectedRevision !== snapshot.revision) {
				return { status: "content_changed" as const };
			}
			const chunk = createDocumentMarkdownSnapshot(snapshot.markdown).readChunk(offset);
			return chunk
				? { ...chunk, revision: snapshot.revision, status: "ready" as const }
				: { status: "invalid_offset" as const };
		}),
	};
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
