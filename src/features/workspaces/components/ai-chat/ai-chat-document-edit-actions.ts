import { isToolUIPart } from "ai";

import { getToolPartName } from "#/features/workspaces/components/ai-chat/ai-chat-display-state";
import type { AiChatMessagePart } from "#/features/workspaces/components/ai-chat/types";
import { asRecord } from "#/lib/record";

export interface AiChatDocumentEditGroup {
	itemId: string;
	/** Summed from the edits themselves: a record of what this turn did, not a
	 * running estimate of how much of it survives. */
	lineChanges: { added: number; removed: number };
	path: string;
	receiptIds: string[];
}

export function getAiChatDocumentEditGroups(
	parts: readonly AiChatMessagePart[],
): AiChatDocumentEditGroup[] {
	const groupsByItemId = new Map<string, AiChatDocumentEditGroup>();
	const seenReceiptIds = new Set<string>();

	for (const part of parts) {
		if (!isToolUIPart(part) || part.state !== "output-available") {
			continue;
		}

		const toolName = getToolPartName(part);

		if (toolName === "workspace_edit_item") {
			const output = asRecord(part.output);
			const path = typeof output.path === "string" ? output.path : null;
			const itemId = typeof output.itemId === "string" ? output.itemId : null;
			const applied = typeof output.applied === "number" ? output.applied : 0;
			const lineChanges = readLineChanges(output.lineChanges);
			const isDocument = output.itemType === "document";
			if (isDocument && itemId && path && applied > 0) {
				addToGroup(groupsByItemId, seenReceiptIds, {
					itemId,
					lineChanges,
					path,
					receiptId: part.toolCallId,
				});
			}
			continue;
		}

		// Edits made from inside an orchestrate (Code Mode) run: the tool part
		// records each nested document edit as a call `action`, carrying the
		// nested invocation id that IS the document-edit receipt id.
		if (toolName === "orchestrate") {
			const calls = asRecord(part.output).calls;
			if (!Array.isArray(calls)) {
				continue;
			}

			for (const call of calls) {
				const action = asRecord(asRecord(call).action);
				if (
					action.kind === "document-edit" &&
					typeof action.itemId === "string" &&
					typeof action.path === "string" &&
					typeof action.receiptId === "string"
				) {
					addToGroup(groupsByItemId, seenReceiptIds, {
						itemId: action.itemId,
						lineChanges: readLineChanges(action.lineChanges),
						path: action.path,
						receiptId: action.receiptId,
					});
				}
			}
		}
	}

	return [...groupsByItemId.values()];
}

function addToGroup(
	groupsByItemId: Map<string, AiChatDocumentEditGroup>,
	seenReceiptIds: Set<string>,
	action: {
		itemId: string;
		lineChanges?: { added: number; removed: number };
		path: string;
		receiptId: string;
	},
) {
	if (seenReceiptIds.has(action.receiptId)) {
		return;
	}
	seenReceiptIds.add(action.receiptId);

	const lineChanges = action.lineChanges ?? { added: 0, removed: 0 };
	const group = groupsByItemId.get(action.itemId);
	if (group) {
		group.lineChanges = {
			added: group.lineChanges.added + lineChanges.added,
			removed: group.lineChanges.removed + lineChanges.removed,
		};
		group.path = action.path;
		group.receiptIds.push(action.receiptId);
	} else {
		groupsByItemId.set(action.itemId, {
			itemId: action.itemId,
			lineChanges,
			path: action.path,
			receiptIds: [action.receiptId],
		});
	}
}

function readLineChanges(value: unknown) {
	const changes = asRecord(value);
	return typeof changes.added === "number" && typeof changes.removed === "number"
		? { added: changes.added, removed: changes.removed }
		: undefined;
}
