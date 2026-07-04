import { describe, expect, it } from "vitest";

import {
	capMcpReadItemsContent,
	MCP_READ_CONTENT_TRUNCATION_NOTICE,
	MCP_READ_MAX_TOTAL_CONTENT_CHARS,
} from "#/features/workspaces/mcp/mcp-read-content-cap";
import type { WorkspaceReadItemsResult } from "#/features/workspaces/operations/read-items";

function createReadResult(
	items: WorkspaceReadItemsResult["items"],
	failed: WorkspaceReadItemsResult["failed"] = [],
): WorkspaceReadItemsResult {
	return { items, failed };
}

describe("capMcpReadItemsContent", () => {
	it("returns items unchanged when total content is within budget", () => {
		const result = createReadResult([
			{
				path: "/doc-a",
				status: "ready",
				type: "document",
				content: "hello",
			},
			{
				path: "/doc-b",
				status: "ready",
				type: "document",
				content: "world",
			},
		]);

		expect(capMcpReadItemsContent(result, 100)).toEqual({
			items: [
				{
					path: "/doc-a",
					status: "ready",
					type: "document",
					content: "hello",
				},
				{
					path: "/doc-b",
					status: "ready",
					type: "document",
					content: "world",
				},
			],
			failed: [],
		});
	});

	it("truncates a single oversized item and sets truncated flags", () => {
		const content = "x".repeat(50);
		const result = createReadResult([
			{
				path: "/large.pdf",
				status: "ready",
				type: "file",
				content,
			},
		]);

		const capped = capMcpReadItemsContent(result, 20);

		expect(capped.truncated).toBe(true);
		expect(capped.items[0]?.truncated).toBe(true);
		expect(capped.items[0]?.content).toBe(`${"x".repeat(20)}${MCP_READ_CONTENT_TRUNCATION_NOTICE}`);
	});

	it("carries budget across items and empties later items when exhausted", () => {
		const result = createReadResult([
			{
				path: "/first",
				status: "ready",
				type: "document",
				content: "aaaa",
			},
			{
				path: "/second",
				status: "ready",
				type: "document",
				content: "bbbb",
			},
			{
				path: "/third",
				status: "ready",
				type: "document",
				content: "cccc",
			},
		]);

		const capped = capMcpReadItemsContent(result, 6);

		expect(capped.truncated).toBe(true);
		expect(capped.items[0]).toMatchObject({
			path: "/first",
			content: "aaaa",
		});
		expect(capped.items[0]?.truncated).toBeUndefined();
		expect(capped.items[1]).toMatchObject({
			path: "/second",
			truncated: true,
		});
		expect(capped.items[1]?.content).toBe(`bb${MCP_READ_CONTENT_TRUNCATION_NOTICE}`);
		expect(capped.items[2]).toMatchObject({
			path: "/third",
			content: "",
			truncated: true,
		});
	});

	it("does not split a surrogate pair at the truncation boundary", () => {
		// "ab" then a rocket emoji (astral char = one surrogate pair). Budget of 3
		// would cut between the high and low surrogate without the guard.
		const content = `ab${"\u{1F680}"}cd`;
		const result = createReadResult([
			{
				path: "/emoji",
				status: "ready",
				type: "document",
				content,
			},
		]);

		const capped = capMcpReadItemsContent(result, 3);
		const cappedContent = capped.items[0]?.content;

		expect(capped.items[0]?.truncated).toBe(true);
		expect(cappedContent).toBe(`ab${MCP_READ_CONTENT_TRUNCATION_NOTICE}`);
		// No lone surrogate should remain in the kept text.
		const keptText = cappedContent!.slice(0, -MCP_READ_CONTENT_TRUNCATION_NOTICE.length);
		expect(keptText).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
	});

	it("leaves items without content untouched", () => {
		const result = createReadResult([
			{
				path: "/pending.png",
				status: "pending",
				type: "file",
			},
			{
				path: "/failed.png",
				status: "failed",
				type: "file",
			},
		]);

		const capped = capMcpReadItemsContent(result, 10);

		expect(capped.truncated).toBeUndefined();
		expect(capped.items).toEqual(result.items);
	});

	it("preserves failed entries and ordering", () => {
		const result = createReadResult(
			[
				{
					path: "/doc",
					status: "ready",
					type: "document",
					content: "ok",
				},
			],
			[{ code: "path_not_found", index: 1, path: "/missing" }],
		);

		const capped = capMcpReadItemsContent(result, 100);

		expect(capped.failed).toEqual(result.failed);
		expect(capped.items[0]?.path).toBe("/doc");
	});

	it("uses MCP_READ_MAX_TOTAL_CONTENT_CHARS by default", () => {
		const content = "a".repeat(MCP_READ_MAX_TOTAL_CONTENT_CHARS + 1);
		const result = createReadResult([
			{
				path: "/doc",
				status: "ready",
				type: "document",
				content,
			},
		]);

		const capped = capMcpReadItemsContent(result);
		const cappedContent = capped.items[0]?.content;

		expect(capped.truncated).toBe(true);
		expect(cappedContent).toBeDefined();
		expect(cappedContent!.length).toBeGreaterThan(MCP_READ_MAX_TOTAL_CONTENT_CHARS);
		expect(cappedContent!.length).toBeLessThanOrEqual(
			MCP_READ_MAX_TOTAL_CONTENT_CHARS + MCP_READ_CONTENT_TRUNCATION_NOTICE.length,
		);
	});
});
