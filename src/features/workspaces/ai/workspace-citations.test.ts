import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
	collectWorkspaceReferenceRecords,
	getWorkspaceCitationRecords,
	reconcileWorkspaceMessageCitations,
	stripWorkspaceCitationTags,
} from "#/features/workspaces/ai/workspace-citations";
import type { WorkspaceReferenceRecord } from "#/features/workspaces/ai/workspace-reference";

const first = reference("wr_AAAAAAAA", "item-1");
const second = reference("wr_BBBBBBBB", "item-2");

describe("workspace citations", () => {
	it("persists only known refs used by assistant text in first-use order", () => {
		const message = assistantMessage(
			`Alpha <citation ref="wr_BBBBBBBB"></citation> beta ` +
				`<citation ref="wr_UNKNOWN0"></citation> gamma ` +
				`<citation ref="wr_AAAAAAAA"/> again <citation ref="wr_BBBBBBBB"></citation>`,
		);
		const reconciled = reconcileWorkspaceMessageCitations(message, [first, second]);

		expect(getWorkspaceCitationRecords(reconciled)).toEqual([second, first]);
	});

	it("rejects a ref that maps to different durable locations", () => {
		const collision = reference("wr_AAAAAAAA", "item-2");
		const message = assistantMessage(`Alpha <citation ref="wr_AAAAAAAA"></citation>`);

		expect(
			getWorkspaceCitationRecords(reconcileWorkspaceMessageCitations(message, [first, collision])),
		).toEqual([]);
	});

	it("ignores citation syntax in Markdown code", () => {
		const message = assistantMessage(
			[
				'`<citation ref="wr_AAAAAAAA"></citation>`',
				"",
				"```html",
				'<citation ref="wr_BBBBBBBB"></citation>',
				"```",
			].join("\n"),
		);

		expect(
			getWorkspaceCitationRecords(reconcileWorkspaceMessageCitations(message, [first, second])),
		).toEqual([]);
	});

	it("is idempotent and removes stale normalized records", () => {
		const message = assistantMessage(`Alpha <citation ref="wr_AAAAAAAA"></citation>`);
		const reconciled = reconcileWorkspaceMessageCitations(message, [first]);

		expect(reconcileWorkspaceMessageCitations(reconciled, [first])).toBe(reconciled);
		expect(
			getWorkspaceCitationRecords(
				reconcileWorkspaceMessageCitations(
					{ ...reconciled, parts: [{ type: "text", text: "No citation" }, reconciled.parts[1]] },
					[first],
				),
			),
		).toEqual([]);
	});

	it("collapses duplicate citation data parts to one canonical part", () => {
		const message = assistantMessage(`Alpha <citation ref="wr_AAAAAAAA"></citation>`);
		const reconciled = reconcileWorkspaceMessageCitations(message, [first]);
		const duplicated = {
			...reconciled,
			parts: [...reconciled.parts, reconciled.parts[1]],
		};
		const repaired = reconcileWorkspaceMessageCitations(duplicated, [first]);

		expect(repaired.parts.filter((part) => part.type === "data-workspace-citations")).toHaveLength(
			1,
		);
	});

	it("collects references from direct workspace reads", () => {
		const readOutput = {
			references: [first],
			results: [
				{
					content: "# Notes",
					format: "markdown",
					itemId: "item-1",
					location: {
						endLine: 1,
						kind: "lines",
						startLine: 1,
						totalLines: 1,
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
						type: "data-workspace-citations",
						id: "workspace-citations",
						data: { citations: [first], version: 1 },
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

	it("preserves literal citation syntax in copied Markdown code", () => {
		const text = [
			'Alpha <citation ref="wr_AAAAAAAA"></citation>',
			"",
			'`<citation ref="wr_AAAAAAAA"></citation>`',
			"",
			"```html",
			'<citation ref="wr_BBBBBBBB"></citation>',
			"```",
		].join("\n");

		expect(stripWorkspaceCitationTags(text)).toBe(
			[
				"Alpha ",
				"",
				'`<citation ref="wr_AAAAAAAA"></citation>`',
				"",
				"```html",
				'<citation ref="wr_BBBBBBBB"></citation>',
				"```",
			].join("\n"),
		);
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
