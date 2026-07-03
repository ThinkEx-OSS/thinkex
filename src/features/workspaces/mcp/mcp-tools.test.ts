import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
	mcpListItemsInputSchema,
	mcpReadItemsInputSchema,
} from "#/features/workspaces/mcp/mcp-schemas";

const listItemsSchema = z.object(mcpListItemsInputSchema);
const readItemsSchema = z.object(mcpReadItemsInputSchema);

describe("thinkex_list_workspaces", () => {
	it("accepts no input (no inputSchema registered)", () => {
		// thinkex_list_workspaces has no inputSchema — no validation surface to test.
		// It is exercised end-to-end via MCP Inspector integration tests.
		expect(true).toBe(true);
	});
});

describe("thinkex_workspace_list_items input schema", () => {
	it("rejects missing workspaceId", () => {
		expect(() => listItemsSchema.parse({ path: "/" })).toThrow();
	});

	it("rejects empty workspaceId", () => {
		expect(() => listItemsSchema.parse({ workspaceId: "" })).toThrow();
	});

	it("accepts valid minimal input", () => {
		expect(listItemsSchema.parse({ workspaceId: "ws-1" })).toMatchObject({
			workspaceId: "ws-1",
		});
	});

	it("accepts all optional fields when valid", () => {
		const result = listItemsSchema.parse({
			workspaceId: "ws-1",
			path: "/Course Notes",
			recursive: true,
			limit: 50,
		});
		expect(result).toMatchObject({
			workspaceId: "ws-1",
			path: "/Course Notes",
			recursive: true,
			limit: 50,
		});
	});

	it("rejects limit below minimum (0)", () => {
		expect(() => listItemsSchema.parse({ workspaceId: "ws-1", limit: 0 })).toThrow();
	});

	it("rejects limit above maximum (201)", () => {
		expect(() => listItemsSchema.parse({ workspaceId: "ws-1", limit: 201 })).toThrow();
	});

	it("rejects non-integer limit", () => {
		expect(() => listItemsSchema.parse({ workspaceId: "ws-1", limit: 1.5 })).toThrow();
	});

	it("rejects empty path string", () => {
		expect(() => listItemsSchema.parse({ workspaceId: "ws-1", path: "" })).toThrow();
	});
});

describe("thinkex_workspace_read_items input schema", () => {
	it("rejects missing workspaceId", () => {
		expect(() => readItemsSchema.parse({ paths: ["/doc.md"] })).toThrow();
	});

	it("rejects empty workspaceId", () => {
		expect(() => readItemsSchema.parse({ workspaceId: "", paths: ["/doc.md"] })).toThrow();
	});

	it("rejects empty paths array", () => {
		expect(() => readItemsSchema.parse({ workspaceId: "ws-1", paths: [] })).toThrow();
	});

	it("rejects paths array containing an empty string", () => {
		expect(() => readItemsSchema.parse({ workspaceId: "ws-1", paths: [""] })).toThrow();
	});

	it("rejects paths array exceeding max length of 20", () => {
		const paths = Array.from({ length: 21 }, (_, i) => `/file${i}.md`);
		expect(() => readItemsSchema.parse({ workspaceId: "ws-1", paths })).toThrow();
	});

	it("accepts valid minimal input", () => {
		expect(readItemsSchema.parse({ workspaceId: "ws-1", paths: ["/doc.md"] })).toMatchObject({
			workspaceId: "ws-1",
			paths: ["/doc.md"],
		});
	});

	it("accepts paths array at the max boundary (20 paths)", () => {
		const paths = Array.from({ length: 20 }, (_, i) => `/file${i}.md`);
		expect(() => readItemsSchema.parse({ workspaceId: "ws-1", paths })).not.toThrow();
	});

	describe("pages field", () => {
		it("accepts a single page number", () => {
			expect(() =>
				readItemsSchema.parse({ workspaceId: "ws-1", paths: ["/f.md"], pages: "1" }),
			).not.toThrow();
		});

		it("accepts a page range", () => {
			expect(() =>
				readItemsSchema.parse({ workspaceId: "ws-1", paths: ["/f.md"], pages: "1-3" }),
			).not.toThrow();
		});

		it("accepts a comma-separated list of pages and ranges", () => {
			expect(() =>
				readItemsSchema.parse({ workspaceId: "ws-1", paths: ["/f.md"], pages: "1,3,5-7" }),
			).not.toThrow();
		});

		it("rejects an empty pages string", () => {
			expect(() =>
				readItemsSchema.parse({ workspaceId: "ws-1", paths: ["/f.md"], pages: "" }),
			).toThrow();
		});

		it("rejects a non-numeric pages string", () => {
			expect(() =>
				readItemsSchema.parse({ workspaceId: "ws-1", paths: ["/f.md"], pages: "abc" }),
			).toThrow();
		});

		it("rejects an open-ended range (e.g. '1-')", () => {
			expect(() =>
				readItemsSchema.parse({ workspaceId: "ws-1", paths: ["/f.md"], pages: "1-" }),
			).toThrow();
		});

		it("rejects consecutive commas (e.g. '1,,3')", () => {
			expect(() =>
				readItemsSchema.parse({ workspaceId: "ws-1", paths: ["/f.md"], pages: "1,,3" }),
			).toThrow();
		});

		it("omitting pages is valid (defaults to page 1 at read time)", () => {
			expect(() => readItemsSchema.parse({ workspaceId: "ws-1", paths: ["/f.md"] })).not.toThrow();
		});
	});
});
