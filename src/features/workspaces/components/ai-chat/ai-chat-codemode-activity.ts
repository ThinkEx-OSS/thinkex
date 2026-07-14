import type { ToolLogEntry } from "@cloudflare/codemode";

import {
	getFinishedToolReceipt,
	getRunningToolReceipt,
	type AiChatToolReceiptStatus,
} from "#/features/workspaces/components/ai-chat/ai-chat-tool-receipts";

export interface AiChatToolChildActivity {
	id: string;
	status: AiChatToolReceiptStatus;
	summary: string;
	toolName: string;
}

const callStatusByState = {
	applied: "completed",
	error: "failed",
	executing: "running",
	pending: "running",
	reverted: "failed",
} as const satisfies Record<ToolLogEntry["state"], AiChatToolChildActivity["status"]>;

export function getCodemodeCallActivities(output: unknown): AiChatToolChildActivity[] | undefined {
	const calls = getCalls(output);
	return calls?.filter(isToolLogEntry).map(toToolActivity);
}

function toToolActivity(call: ToolLogEntry): AiChatToolChildActivity {
	const status = callStatusByState[call.state];
	const receipt =
		status === "running"
			? getRunningToolReceipt({ toolInput: call.args, toolName: call.method })
			: getFinishedToolReceipt({
					baseStatus: status,
					output: call.result,
					toolInput: call.args,
					toolName: call.method,
				});
	const needsApproval = call.state === "pending" && call.requiresApproval;

	return {
		id: `${call.seq}:${call.connector}:${call.method}`,
		status: receipt.status,
		summary: needsApproval ? `Approval required · ${receipt.summary}` : receipt.summary,
		toolName: call.method,
	};
}

function getCalls(value: unknown): unknown[] | undefined {
	if (!value || typeof value !== "object" || !("calls" in value)) {
		return undefined;
	}

	return Array.isArray(value.calls) ? value.calls : [];
}

function isToolLogEntry(value: unknown): value is ToolLogEntry {
	if (!value || typeof value !== "object") {
		return false;
	}
	const record = value as Record<string, unknown>;

	return (
		typeof record.seq === "number" &&
		typeof record.connector === "string" &&
		typeof record.method === "string" &&
		"args" in record &&
		typeof record.requiresApproval === "boolean" &&
		isCallState(record.state)
	);
}

function isCallState(value: unknown): value is ToolLogEntry["state"] {
	return typeof value === "string" && Object.hasOwn(callStatusByState, value);
}
