import type { TurnContext } from "@cloudflare/think";

import {
	DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID,
	getWorkspaceAiChatModelById,
	type WorkspaceAiChatModelId,
} from "#/features/workspaces/ai/models";

// Task signals the Auto router reads for one turn. Extraction is defensive:
// anything missing or malformed becomes the zero value, never an error.
export interface WorkspaceAiRoutingSignals {
	/** Image/file parts across user messages; the routed model must accept them. */
	attachmentCount: number;
	/** Code fences or code-like tokens in the latest user message. */
	hasCodeSignals: boolean;
	/** Text characters in the latest user message. */
	lastUserTextChars: number;
	messageCount: number;
	/** Tool-call parts already present in the conversation history. */
	priorToolCallCount: number;
	/** Text characters across every message in the assembled turn. */
	totalTextChars: number;
	/** Workspace items and quotes the user attached via the context picker. */
	workspaceReferenceCount: number;
}

export type WorkspaceAiAutoRouteReason =
	| "attachment-heavy"
	| "long-context"
	| "tool-heavy"
	| "simple-chat"
	| "high-reasoning-default"
	| "fallback-unavailable";

export interface WorkspaceAiAutoRoute {
	gatewayModel: string;
	modelId: WorkspaceAiChatModelId;
	reason: WorkspaceAiAutoRouteReason;
}

// Tuning knobs for the routing rules below, kept as data so policy changes are
// threshold edits rather than runtime rewrites.
export const WORKSPACE_AI_AUTO_ROUTING_THRESHOLDS = {
	/** Roughly 6k tokens of conversation, where large-context models earn their keep. */
	longContextTotalTextChars: 24_000,
	longContextMessageCount: 40,
	longContextWorkspaceReferenceCount: 4,
	toolHeavyPriorToolCallCount: 3,
	/** A couple of sentences at most. */
	simpleChatMaxLastUserTextChars: 280,
	simpleChatMaxMessageCount: 12,
} as const;

export type WorkspaceAiAutoRoutingThresholds = typeof WORKSPACE_AI_AUTO_ROUTING_THRESHOLDS;

export interface WorkspaceAiAutoRoutingRule {
	matches: (
		signals: WorkspaceAiRoutingSignals,
		thresholds: WorkspaceAiAutoRoutingThresholds,
	) => boolean;
	reason: Exclude<WorkspaceAiAutoRouteReason, "high-reasoning-default" | "fallback-unavailable">;
	targetModelId: WorkspaceAiChatModelId;
}

// First match wins. Capability constraints (attachments, context size) come
// before cost preferences so a short message with an image still lands on a
// model that can read it. Targets must stay standard billing tier: a user who
// picked Auto must never be routed into premium pricing.
export const WORKSPACE_AI_AUTO_ROUTING_RULES: readonly WorkspaceAiAutoRoutingRule[] = [
	{
		matches: (signals) => signals.attachmentCount > 0,
		reason: "attachment-heavy",
		targetModelId: "gemini",
	},
	{
		matches: (signals, thresholds) =>
			signals.totalTextChars >= thresholds.longContextTotalTextChars ||
			signals.messageCount >= thresholds.longContextMessageCount ||
			signals.workspaceReferenceCount >= thresholds.longContextWorkspaceReferenceCount,
		reason: "long-context",
		targetModelId: "gemini",
	},
	{
		matches: (signals, thresholds) =>
			signals.hasCodeSignals ||
			signals.priorToolCallCount >= thresholds.toolHeavyPriorToolCallCount,
		reason: "tool-heavy",
		targetModelId: "chatgpt-mini",
	},
	{
		matches: (signals, thresholds) =>
			signals.lastUserTextChars > 0 &&
			signals.lastUserTextChars <= thresholds.simpleChatMaxLastUserTextChars &&
			signals.messageCount <= thresholds.simpleChatMaxMessageCount,
		reason: "simple-chat",
		targetModelId: "claude-haiku",
	},
];

export function routeWorkspaceAiAutoModel(
	signals: WorkspaceAiRoutingSignals,
	rules: readonly WorkspaceAiAutoRoutingRule[] = WORKSPACE_AI_AUTO_ROUTING_RULES,
): WorkspaceAiAutoRoute {
	for (const rule of rules) {
		if (!rule.matches(signals, WORKSPACE_AI_AUTO_ROUTING_THRESHOLDS)) {
			continue;
		}

		const target = getStandardTierRouteTarget(rule.targetModelId);

		if (!target) {
			// A rule pointing at a removed or re-tiered model degrades to the
			// default instead of failing the turn or leaking into premium pricing.
			return getDefaultWorkspaceAiAutoRoute("fallback-unavailable");
		}

		return {
			gatewayModel: target.gatewayModel,
			modelId: target.id,
			reason: rule.reason,
		};
	}

	return getDefaultWorkspaceAiAutoRoute("high-reasoning-default");
}

function getDefaultWorkspaceAiAutoRoute(
	reason: Extract<WorkspaceAiAutoRouteReason, "high-reasoning-default" | "fallback-unavailable">,
): WorkspaceAiAutoRoute {
	const model = getWorkspaceAiChatModelById(DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID);

	return {
		gatewayModel: model.gatewayModel,
		modelId: model.id,
		reason,
	};
}

function getStandardTierRouteTarget(modelId: WorkspaceAiChatModelId) {
	const model = getWorkspaceAiChatModelById(modelId);

	// getWorkspaceAiChatModelById falls back to the default entry for unknown
	// ids; treat that as "unavailable" rather than silently routing there.
	if (model.id !== modelId || model.billingTier !== "standard") {
		return undefined;
	}

	return model;
}

const EMPTY_WORKSPACE_AI_ROUTING_SIGNALS: WorkspaceAiRoutingSignals = {
	attachmentCount: 0,
	hasCodeSignals: false,
	lastUserTextChars: 0,
	messageCount: 0,
	priorToolCallCount: 0,
	totalTextChars: 0,
	workspaceReferenceCount: 0,
};

// Lightweight markers that the user is doing code or data work. These bias
// toward the tool-following model; misses simply keep the default route, so
// the list favors precision over recall.
const WORKSPACE_AI_CODE_SIGNAL_PATTERNS: readonly RegExp[] = [
	/```/,
	/\b(?:function|const|class |def |import |export |return|async|await)\b/,
	/\b(?:SELECT|INSERT|UPDATE|DELETE)\b.+\b(?:FROM|INTO|SET|WHERE)\b/,
	/\.(?:py|ts|tsx|js|jsx|json|csv|sql|sh|ya?ml)\b/i,
	/\b(?:stack ?trace|traceback|regex|refactor|typescript|javascript|python)\b/i,
];

export function extractWorkspaceAiRoutingSignals(ctx: TurnContext): WorkspaceAiRoutingSignals {
	try {
		const messages: unknown[] = Array.isArray(ctx.messages) ? ctx.messages : [];
		let attachmentCount = 0;
		let priorToolCallCount = 0;
		let totalTextChars = 0;
		let lastUserText = "";

		for (const message of messages) {
			const record = asRecord(message);

			if (!record) {
				continue;
			}

			const text = getMessageText(record.content);
			totalTextChars += text.length;

			if (record.role === "user") {
				attachmentCount += countParts(record.content, ["file", "image"]);
				lastUserText = text;
			} else if (record.role === "assistant") {
				priorToolCallCount += countParts(record.content, ["tool-call"]);
			}
		}

		return {
			attachmentCount,
			hasCodeSignals: WORKSPACE_AI_CODE_SIGNAL_PATTERNS.some((pattern) =>
				pattern.test(lastUserText),
			),
			lastUserTextChars: lastUserText.length,
			messageCount: messages.length,
			priorToolCallCount,
			totalTextChars,
			workspaceReferenceCount: countWorkspaceReferences(ctx.body?.workspaceAiContext),
		};
	} catch {
		// Routing signals are best-effort: a malformed turn falls back to the
		// default route instead of failing the turn.
		return EMPTY_WORKSPACE_AI_ROUTING_SIGNALS;
	}
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: undefined;
}

function getMessageText(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}

	if (!Array.isArray(content)) {
		return "";
	}

	return content
		.map((part) => {
			const record = asRecord(part);
			return record?.type === "text" && typeof record.text === "string" ? record.text : "";
		})
		.join("");
}

function countParts(content: unknown, types: readonly string[]): number {
	if (!Array.isArray(content)) {
		return 0;
	}

	return content.filter((part) => {
		const type = asRecord(part)?.type;
		return typeof type === "string" && types.includes(type);
	}).length;
}

function countWorkspaceReferences(workspaceAiContext: unknown): number {
	const snapshot = asRecord(workspaceAiContext);

	if (!snapshot) {
		return 0;
	}

	const selectedItems = Array.isArray(snapshot.selectedItems) ? snapshot.selectedItems.length : 0;
	const selectedQuotes = Array.isArray(snapshot.selectedQuotes)
		? snapshot.selectedQuotes.length
		: 0;

	return selectedItems + selectedQuotes;
}
