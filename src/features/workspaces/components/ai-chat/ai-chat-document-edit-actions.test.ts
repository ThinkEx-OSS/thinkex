import { describe, expect, it } from "vitest";

import { getAiChatDocumentEditGroups } from "#/features/workspaces/components/ai-chat/ai-chat-document-edit-actions";
import type { AiChatMessagePart } from "#/features/workspaces/components/ai-chat/types";

describe("AI chat document edit actions", () => {
	it("does not offer document review for an applied flashcard edit", () => {
		expect(
			getAiChatDocumentEditGroups([
				editPart("flashcard", "call-flashcard"),
				editPart("document", "call-document"),
			]),
		).toEqual([
			{
				itemId: "item-document",
				lineChanges: { added: 2, removed: 1 },
				path: "/Document",
				receiptIds: ["call-document"],
			},
		]);
	});

	it("derives receipts from document edits made inside an orchestrate run", () => {
		expect(
			getAiChatDocumentEditGroups([orchestratePart(), editPart("document", "call-direct")]),
		).toEqual([
			{
				itemId: "item-document",
				lineChanges: { added: 5, removed: 3 },
				path: "/Document",
				receiptIds: ["nested-edit-1", "call-direct"],
			},
		]);
	});
});

function orchestratePart() {
	return {
		input: { title: "Updating notes", code: "async () => {}" },
		output: {
			status: "completed",
			result: null,
			calls: [
				{ toolName: "workspace_read_items", status: "completed" },
				{
					toolName: "workspace_edit_item",
					status: "completed",
					action: {
						kind: "document-edit",
						itemId: "item-document",
						path: "/Document",
						receiptId: "nested-edit-1",
						lineChanges: { added: 3, removed: 2 },
					},
				},
			],
		},
		state: "output-available",
		toolCallId: "call-orchestrate",
		type: "tool-orchestrate",
	} as AiChatMessagePart;
}

function editPart(itemType: "document" | "flashcard", toolCallId: string) {
	return {
		input: {},
		output: {
			applied: 1,
			itemId: `item-${itemType}`,
			itemType,
			lineChanges: { added: 2, removed: 1 },
			path: itemType === "document" ? "/Document" : "/Flashcards",
		},
		state: "output-available",
		toolCallId,
		type: "tool-workspace_edit_item",
	} as AiChatMessagePart;
}
