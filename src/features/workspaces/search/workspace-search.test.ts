import { describe, expect, it } from "vitest";

import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import { iterateWorkspaceSearchTextChunks } from "#/features/workspaces/search/workspace-search-chunks";
import { iteratePreparedWorkspaceSearchChunks } from "#/features/workspaces/search/workspace-search-content";
import { workspaceSearchInputSchema } from "#/features/workspaces/search/workspace-search-contract";
import { fuseWorkspaceSearchRanks } from "#/features/workspaces/search/workspace-search-ranking";
import {
	createWorkspaceSearchVectorMetadata,
	resolveWorkspaceSearchScope,
} from "#/features/workspaces/search/workspace-search-scope";
import { buildWorkspaceSearchSourceVersion } from "#/features/workspaces/search/workspace-search-version";

describe("workspace search", () => {
	it("chunks long content with bounded overlap and line locations", () => {
		const text = Array.from(
			{ length: 80 },
			(_, index) => `Line ${index + 1}: ${"searchable content ".repeat(4)}`,
		).join("\n");
		const chunks = Array.from(iterateWorkspaceSearchTextChunks(text));

		expect(chunks.length).toBeGreaterThan(2);
		expect(chunks[0]).toMatchObject({ startLine: 1 });
		expect(chunks.at(-1)?.endLine).toBe(80);
		expect(chunks.every((chunk) => chunk.content.length <= 1_800)).toBe(true);
		expect(chunks[1]?.startLine).toBeLessThanOrEqual((chunks[0]?.endLine ?? 0) + 1);
	});

	it("does not extend a chunk past its hard boundary for a separator", () => {
		const [chunk] = Array.from(
			iterateWorkspaceSearchTextChunks(`${"a".repeat(1_800)}. ${"b".repeat(100)}`),
		);

		expect(chunk?.content).toHaveLength(1_800);
	});

	it("deduplicates repeated content types", () => {
		const input = workspaceSearchInputSchema.parse({
			query: "search files",
			types: ["file", "file"],
		});

		expect(input.types).toEqual(["file"]);
	});

	it("builds canonical source versions for documents and files", () => {
		expect(
			buildWorkspaceSearchSourceVersion({
				type: "document",
				updatedAt: 12,
			}),
		).toBe("v3-bge-m3-1800-scoped:document:12");
		expect(
			buildWorkspaceSearchSourceVersion({
				projectionUpdatedAt: 34,
				sourceHash: "hash",
				type: "file",
				updatedAt: 12,
			}),
		).toBe("v3-bge-m3-1800-scoped:file:12:34:hash");
	});

	it("indexes document content beyond the former per-item cutoff", async () => {
		const marker = "end-of-large-document";
		const checkpoint = JSON.stringify({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: `${"searchable ".repeat(26_000)}${marker}` }],
				},
			],
		});
		const chunks = [];

		for await (const chunk of iteratePreparedWorkspaceSearchChunks({
			bucket: {} as R2Bucket,
			source: {
				itemId: "large-document",
				name: "Large document",
				shellPath: "/large-document.json",
				sourceVersion: "test",
				type: "document",
			},
			workspace: {
				readFile: async () => checkpoint,
			},
		})) {
			chunks.push(chunk);
		}

		expect(checkpoint.length).toBeGreaterThan(250_000);
		expect(chunks.at(-1)?.content).toContain(marker);
	});

	it("fuses lexical and semantic ranks while diversifying items", () => {
		const shared = { chunkId: "shared", itemId: "a" };
		const results = fuseWorkspaceSearchRanks({
			keyword: [
				shared,
				{ chunkId: "a-2", itemId: "a" },
				{ chunkId: "a-3", itemId: "a" },
				{ chunkId: "b-1", itemId: "b" },
			],
			limit: 4,
			semantic: [shared, { chunkId: "c-1", itemId: "c" }],
		});

		expect(results[0]).toEqual(shared);
		expect(results.filter((result) => result.itemId === "a")).toHaveLength(2);
		expect(results.map((result) => result.itemId)).toContain("b");
		expect(results.map((result) => result.itemId)).toContain("c");
	});

	it("resolves recursive folder search through stable parent identifiers", () => {
		const items = [
			createItem({ id: "projects", name: "Projects", type: "folder" }),
			createItem({
				id: "overview",
				name: "Overview",
				parentId: "projects",
				type: "document",
			}),
			createItem({ id: "acme", name: "Acme", parentId: "projects", type: "folder" }),
			createItem({ id: "plan", name: "Plan", parentId: "acme", type: "file" }),
			createItem({ id: "elsewhere", name: "Elsewhere", type: "folder" }),
			createItem({ id: "other", name: "Other", parentId: "elsewhere", type: "file" }),
		];
		const resolved = resolveWorkspaceSearchScope({
			items,
			path: "/Projects",
			types: ["document", "file"],
		});

		expect(resolved.status).toBe("ready");
		if (resolved.status !== "ready") {
			return;
		}
		expect(resolved.scope.local.kind).toBe("folder");
		if (resolved.scope.local.kind !== "folder") {
			return;
		}
		expect(new Set(resolved.scope.local.folderIds)).toEqual(new Set(["projects", "acme"]));
		expect(new Set(readFilteredParentIds(resolved.scope.vectorFilters))).toEqual(
			new Set(["projects", "acme"]),
		);
		expect(
			createWorkspaceSearchVectorMetadata({
				itemId: "plan",
				parentId: "acme",
				type: "file",
			}),
		).toEqual({ itemId: "plan", parentId: "acme", type: "file" });
	});

	it("keeps every recursive folder filter within Vectorize's byte limit", () => {
		const items = [
			createItem({ id: "archive", name: "Archive", type: "folder" }),
			...Array.from({ length: 180 }, (_, index) =>
				createItem({
					id: `folder-${index}-${"x".repeat(24)}`,
					name: `Folder ${index}`,
					parentId: "archive",
					type: "folder",
				}),
			),
		];
		const resolved = resolveWorkspaceSearchScope({
			items,
			path: "/Archive",
			types: ["file"],
		});

		expect(resolved.status).toBe("ready");
		if (resolved.status !== "ready") {
			return;
		}
		expect(resolved.scope.vectorFilters.length).toBeGreaterThan(1);
		expect(
			resolved.scope.vectorFilters.every(
				(filter) => new TextEncoder().encode(JSON.stringify(filter)).byteLength < 2_048,
			),
		).toBe(true);
		expect(new Set(readFilteredParentIds(resolved.scope.vectorFilters)).size).toBe(181);
	});
});

function createItem(
	input: Pick<WorkspaceItemSummary, "id" | "name" | "type"> & {
		parentId?: string | null;
	},
): WorkspaceItemSummary {
	return {
		color: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		deletedAt: null,
		id: input.id,
		meta: "",
		metadataJson: {},
		name: input.name,
		parentId: input.parentId ?? null,
		sortOrder: 0,
		title: input.name,
		type: input.type,
		updatedAt: "2026-01-01T00:00:00.000Z",
		workspaceId: "workspace-1",
	};
}

function readFilteredParentIds(filters: Array<VectorizeVectorMetadataFilter | null>) {
	return filters.flatMap((filter) => {
		if (!filter || !("parentId" in filter)) {
			return [];
		}
		const parentId = filter.parentId;
		if (
			parentId !== null &&
			typeof parentId === "object" &&
			"$in" in parentId &&
			Array.isArray(parentId.$in)
		) {
			return parentId.$in.filter((value): value is string => typeof value === "string");
		}
		return [];
	});
}
