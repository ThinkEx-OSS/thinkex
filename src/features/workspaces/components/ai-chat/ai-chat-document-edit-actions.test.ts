import { describe, expect, it } from "vitest";

import { getAiChatDocumentEditGroups } from "#/features/workspaces/components/ai-chat/ai-chat-document-edit-actions";
import type { AiChatRenderablePart } from "#/features/workspaces/components/ai-chat/ai-chat-display-state";

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
});

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
	} as AiChatRenderablePart;
}
