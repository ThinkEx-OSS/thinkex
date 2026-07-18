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
					{ cursor: "opaque", mode: "continue", path: "/Notes" },
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
							{ additionalProperties: false, required: ["path", "cursor", "mode"] },
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
						content: "# Notes",
						format: "markdown",
						location: { endLine: 1, kind: "lines", startLine: 1, totalLines: 1 },
						path: "/Notes",
						status: "ready",
						type: "document",
					},
					{
						content: "Page one",
						format: "markdown",
						location: { kind: "pages", requested: "1", returned: [1], total: 1 },
						path: "/Book.pdf",
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
						location: { kind: "pages", requested: "1", returned: [1], total: 1 },
						path: "/Notes",
						status: "ready",
						type: "document",
					},
				],
			}).success,
		).toBe(false);
	});
});
