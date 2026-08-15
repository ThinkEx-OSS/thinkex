import { asSchema } from "ai";
import { describe, expect, it } from "vitest";

import {
	workspaceReadItemsInputSchema,
	workspaceReadItemsOutputSchema,
} from "#/features/workspaces/content/workspace-content-contract";

describe("workspace read tool schemas", () => {
	it("uses one explicit read mode per request", () => {
		expect(
			workspaceReadItemsInputSchema.safeParse({
				requests: [
					{ mode: "start", path: "/Notes" },
					{ mode: "pages", path: "/Book.pdf", range: "1-3" },
					{ mode: "entries", path: "/Biology", range: "1-3" },
					{ mode: "ref", ref: "Xk7p2Qa9/b_x7Kp2Qa9x8Lm" },
					{ mode: "ref", ref: "Xk7p2Qa9" },
				],
			}).success,
		).toBe(true);
		expect(
			workspaceReadItemsInputSchema.safeParse({
				requests: [{ path: "/Book.pdf", pages: "1-3" }],
			}).success,
		).toBe(false);
		expect(
			workspaceReadItemsInputSchema.safeParse({ requests: [{ path: "/Notes" }] }).success,
		).toBe(false);
		expect(
			workspaceReadItemsInputSchema.safeParse({
				requests: [{ mode: "ref", ref: "not an address" }],
			}).success,
		).toBe(false);
	});

	it("emits a strict-provider-compatible JSON Schema", () => {
		const { jsonSchema } = asSchema(workspaceReadItemsInputSchema);

		expect(jsonSchema).toMatchObject({
			additionalProperties: false,
			properties: {
				requests: {
					items: {
						anyOf: [
							{ additionalProperties: false, required: ["path", "mode"] },
							{ additionalProperties: false, required: ["path", "mode", "range"] },
							{
								additionalProperties: false,
								properties: { mode: { const: "entries" } },
								required: ["path", "mode", "range"],
							},
							{ additionalProperties: false, required: ["mode", "ref"] },
						],
					},
				},
			},
			required: ["requests"],
		});
		expect(JSON.stringify(jsonSchema)).not.toContain('"oneOf"');
	});

	it("keeps document and file result shapes disjoint", () => {
		expect(
			workspaceReadItemsOutputSchema.safeParse({
				results: [
					{
						content: '<h1 data-ref="b_abcdefghijkl.r_012345">Notes</h1>',
						format: "html",
						itemId: "notes",
						location: { endBlock: 1, kind: "blocks", startBlock: 1, totalBlocks: 1 },
						path: "/Notes",
						ref: "Xk7p2Qa9",
						status: "ready",
						type: "document",
					},
					{
						assetKind: "pdf",
						content: "Page one",
						format: "markdown",
						itemId: "book",
						location: { kind: "pages", requested: "1", returned: [1], total: 1 },
						path: "/Book.pdf",
						ref: "Yk7p2Qa9",
						status: "ready",
						type: "file",
					},
				],
			}).success,
		).toBe(true);
		expect(
			workspaceReadItemsOutputSchema.safeParse({
				results: [
					{
						content: "Page one",
						format: "markdown",
						itemId: "notes",
						location: { kind: "pages", requested: "1", returned: [1], total: 1 },
						path: "/Notes",
						ref: "Xk7p2Qa9",
						status: "ready",
						type: "document",
					},
				],
			}).success,
		).toBe(false);
	});
});
