import { isToolUIPart } from "ai";

import {
	getToolPartName,
	isAiChatToolGroupPart,
	type AiChatRenderablePart,
} from "#/features/workspaces/components/ai-chat/ai-chat-display-state";
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
	parts: readonly AiChatRenderablePart[],
): AiChatDocumentEditGroup[] {
	const groupsByItemId = new Map<string, AiChatDocumentEditGroup>();
	const seenReceiptIds = new Set<string>();

	for (const part of parts) {
		if (isAiChatToolGroupPart(part)) {
			for (const child of part.children) {
				if (child.status === "completed" && child.action?.kind === "document-edit") {
					addToGroup(groupsByItemId, seenReceiptIds, child.action);
				}
			}
			continue;
		}

		if (
			!isToolUIPart(part) ||
			getToolPartName(part) !== "workspace_edit_item" ||
			part.state !== "output-available"
		) {
			continue;
		}

		const output = asRecord(part.output);
		const path = typeof output.path === "string" ? output.path : null;
		const itemId = typeof output.itemId === "string" ? output.itemId : null;
		const applied = typeof output.applied === "number" ? output.applied : 0;
		if (itemId && path && applied > 0) {
			addToGroup(groupsByItemId, seenReceiptIds, {
				itemId,
				lineChanges: readLineChanges(output.lineChanges),
				path,
				receiptId: part.toolCallId,
			});
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
