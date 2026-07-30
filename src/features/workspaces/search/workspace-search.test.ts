import { describe, expect, it } from "vitest";

import { chunkWorkspaceSearchText } from "#/features/workspaces/search/workspace-search-chunks";
import { fuseWorkspaceSearchRanks } from "#/features/workspaces/search/workspace-search-ranking";

describe("workspace search", () => {
	it("chunks long content with bounded overlap and line locations", () => {
		const text = Array.from(
			{ length: 80 },
			(_, index) => `Line ${index + 1}: ${"searchable content ".repeat(4)}`,
		).join("\n");
		const chunks = chunkWorkspaceSearchText(text);

		expect(chunks.length).toBeGreaterThan(2);
		expect(chunks[0]).toMatchObject({ startLine: 1 });
		expect(chunks.at(-1)?.endLine).toBe(80);
		expect(chunks.every((chunk) => chunk.content.length <= 1_800)).toBe(true);
		expect(chunks[1]?.startLine).toBeLessThanOrEqual((chunks[0]?.endLine ?? 0) + 1);
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
});
