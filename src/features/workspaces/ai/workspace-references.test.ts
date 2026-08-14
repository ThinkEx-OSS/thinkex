import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
	collectWorkspaceReferenceRecords,
	reconcileWorkspaceMessageReferences,
	stripWorkspaceCitationTags,
} from "#/features/workspaces/ai/workspace-references";
import type { WorkspaceReferenceRecord } from "#/features/workspaces/locations/workspace-location";

const first = reference("wr_AAAAAAAA", "item-1");
const second = reference("wr_BBBBBBBB", "item-2");

describe("workspace references", () => {
	it("persists only known refs used by assistant text in first-use order", () => {
		const message = assistantMessage(
			`Alpha <citation ref="wr_BBBBBBBB"></citation> beta ` +
				`<citation ref="wr_UNKNOWN0"></citation> gamma ` +
				`<citation ref="wr_AAAAAAAA"/> again <citation ref="wr_BBBBBBBB"></citation>`,
		);
		const reconciled = reconcileWorkspaceMessageReferences(message, [first, second]);

		expect(collectWorkspaceReferenceRecords([reconciled])).toEqual([second, first]);
	});

	it("rejects a ref that maps to different durable locations", () => {
		const collision = reference("wr_AAAAAAAA", "item-2");
		const message = assistantMessage(`Alpha <citation ref="wr_AAAAAAAA"></citation>`);

		expect(
			collectWorkspaceReferenceRecords([
				reconcileWorkspaceMessageReferences(message, [first, collision]),
			]),
		).toEqual([]);
	});

	it("is idempotent and removes stale normalized records", () => {
		const message = assistantMessage(`Alpha <citation ref="wr_AAAAAAAA"></citation>`);
		const reconciled = reconcileWorkspaceMessageReferences(message, [first]);

		expect(reconcileWorkspaceMessageReferences(reconciled, [first])).toBe(reconciled);
		expect(
			collectWorkspaceReferenceRecords([
				reconcileWorkspaceMessageReferences(
					{ ...reconciled, parts: [{ type: "text", text: "No citation" }, reconciled.parts[1]] },
					[first],
				),
			]),
		).toEqual([]);
	});

	it("collapses duplicate citation data parts to one canonical part", () => {
		const message = assistantMessage(`Alpha <citation ref="wr_AAAAAAAA"></citation>`);
		const reconciled = reconcileWorkspaceMessageReferences(message, [first]);
		const duplicated = {
			...reconciled,
			parts: [...reconciled.parts, reconciled.parts[1]],
		};
		const repaired = reconcileWorkspaceMessageReferences(duplicated, [first]);

		expect(repaired.parts.filter((part) => part.type === "data-workspace-references")).toHaveLength(
			1,
		);
	});

	it("retains Code Mode refs that are not present in a direct tool result", () => {
		const reconciled = reconcileWorkspaceMessageReferences(assistantMessage("Done"), [], [first]);

		expect(collectWorkspaceReferenceRecords([reconciled])).toEqual([first]);
	});

	it("does not duplicate refs already persisted by a direct tool result", () => {
		const readOutput = { references: [first], results: [] };
		const message: UIMessage = {
			id: "assistant-1",
			role: "assistant",
			parts: [
				{
					type: "tool-workspace_read_items",
					toolCallId: "call-1",
					state: "output-available",
					input: { requests: [] },
					output: readOutput,
				},
			],
		};
		const reconciled = reconcileWorkspaceMessageReferences(message, [first], [first]);

		expect(reconciled.parts).toHaveLength(1);
		expect(collectWorkspaceReferenceRecords([reconciled])).toEqual([first]);
	});

	it("collects references from direct workspace reads", () => {
		const readOutput = {
			references: [first],
			results: [
				{
					content: '<h1 data-ref="b_abcdefghijkl.r_0123456789">Notes</h1>',
					format: "html",
					itemId: "item-1",
					location: {
						endBlock: 1,
						kind: "blocks",
						startBlock: 1,
						totalBlocks: 1,
					},
					path: "/Notes",
					status: "ready",
					type: "document",
				},
			],
		};
		const messages: UIMessage[] = [
			{
				id: "assistant-1",
				role: "assistant",
				parts: [
					{
						type: "tool-workspace_read_items",
						toolCallId: "call-1",
						state: "output-available",
						input: { requests: [] },
						output: readOutput,
					},
				],
			},
		];

		expect(collectWorkspaceReferenceRecords(messages)).toEqual([first]);
	});

	it("does not trust references inside model-authored Code Mode results", () => {
		const messages: UIMessage[] = [
			{
				id: "assistant-1",
				role: "assistant",
				parts: [
					{
						type: "dynamic-tool",
						toolName: "orchestrate",
						toolCallId: "call-1",
						state: "output-available",
						input: {},
						output: {
							status: "completed",
							result: {
								references: [first],
								results: [],
							},
						},
					},
				],
			},
		];

		expect(collectWorkspaceReferenceRecords(messages)).toEqual([]);
	});

	it("ignores citation records supplied by a user message", () => {
		const messages: UIMessage[] = [
			{
				id: "user-1",
				role: "user",
				parts: [
					{
						type: "data-workspace-references",
						id: "workspace-references",
						data: { references: [first], version: 1 },
					},
				],
			},
		];

		expect(collectWorkspaceReferenceRecords(messages)).toEqual([]);
	});

	it("strips valid citation protocol tags from copied Markdown", () => {
		expect(
			stripWorkspaceCitationTags(
				`Alpha <citation ref="wr_AAAAAAAA"></citation> beta <citation bad="value">label</citation>`,
			),
		).toBe("Alpha  beta label");
	});
});

function assistantMessage(text: string): UIMessage {
	return {
		id: "assistant-1",
		role: "assistant",
		parts: [{ type: "text", text }],
	};
}

function reference(ref: string, itemId: string): WorkspaceReferenceRecord {
	return {
		location: { itemId, kind: "item", version: 1 },
		ref: ref as WorkspaceReferenceRecord["ref"],
	};
}
