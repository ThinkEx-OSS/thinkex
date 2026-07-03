import type { McpActor } from "./mcp-auth";

export type McpToolCallResultStatus = "denied" | "failed" | "ok";

export interface McpToolCallRecord {
	clientId: string | null;
	resultStatus: McpToolCallResultStatus;
	scopes: readonly string[];
	toolName: string;
	userId: string;
	workspaceId?: string;
}

export function recordMcpToolCall(_record: McpToolCallRecord): void {
	// Reserved for future audit/telemetry (e.g. PostHog server events before write tools).
}

export function recordMcpToolCallFromActor(
	actor: McpActor,
	input: Omit<McpToolCallRecord, "clientId" | "scopes" | "userId">,
): void {
	recordMcpToolCall({
		clientId: actor.clientId,
		scopes: [...actor.grantedScopes],
		userId: actor.userId,
		...input,
	});
}
