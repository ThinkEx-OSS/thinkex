import type { TurnContext } from "@cloudflare/think";
import { describe, expect, it } from "vitest";

import {
	extractWorkspaceAiRoutingSignals,
	routeWorkspaceAiAutoModel,
	WORKSPACE_AI_AUTO_ROUTING_THRESHOLDS,
	type WorkspaceAiAutoRoutingRule,
	type WorkspaceAiRoutingSignals,
} from "#/features/workspaces/ai/model-router";
import type { WorkspaceAiChatModelId } from "#/features/workspaces/ai/models";

function buildTurnContext(overrides: Partial<TurnContext> = {}): TurnContext {
	return {
		continuation: false,
		messages: [],
		model: "test-model",
		system: "",
		tools: {},
		...overrides,
	} as TurnContext;
}

function buildSignals(
	overrides: Partial<WorkspaceAiRoutingSignals> = {},
): WorkspaceAiRoutingSignals {
	return {
		attachmentCount: 0,
		hasCodeSignals: false,
		lastUserTextChars: 0,
		messageCount: 0,
		priorToolCallCount: 0,
		totalTextChars: 0,
		workspaceReferenceCount: 0,
		...overrides,
	};
}

describe("workspace AI auto model routing", () => {
	it("routes short simple chat to the fast standard model", () => {
		expect(
			routeWorkspaceAiAutoModel(
				buildSignals({ lastUserTextChars: 40, messageCount: 3, totalTextChars: 40 }),
			),
		).toEqual({
			gatewayModel: "anthropic/claude-haiku-4.5",
			modelId: "claude-haiku",
			reason: "simple-chat",
		});
	});

	it("routes attachment-heavy turns to the large-context model", () => {
		expect(
			routeWorkspaceAiAutoModel(
				buildSignals({ attachmentCount: 2, lastUserTextChars: 40, messageCount: 3 }),
			),
		).toEqual({
			gatewayModel: "google/gemini-3-flash",
			modelId: "gemini",
			reason: "attachment-heavy",
		});
	});

	it("routes long-context turns to the large-context model", () => {
		expect(
			routeWorkspaceAiAutoModel(
				buildSignals({ lastUserTextChars: 120, messageCount: 8, totalTextChars: 60_000 }),
			),
		).toEqual({
			gatewayModel: "google/gemini-3-flash",
			modelId: "gemini",
			reason: "long-context",
		});

		expect(routeWorkspaceAiAutoModel(buildSignals({ workspaceReferenceCount: 6 })).reason).toBe(
			"long-context",
		);
	});

	it("routes tool-heavy and code turns to the tool-following model", () => {
		expect(
			routeWorkspaceAiAutoModel(
				buildSignals({ hasCodeSignals: true, lastUserTextChars: 90, messageCount: 2 }),
			),
		).toEqual({
			gatewayModel: "openai/gpt-5.4-mini",
			modelId: "chatgpt-mini",
			reason: "tool-heavy",
		});

		expect(
			routeWorkspaceAiAutoModel(
				buildSignals({ lastUserTextChars: 90, messageCount: 9, priorToolCallCount: 5 }),
			).reason,
		).toBe("tool-heavy");
	});

	it("falls back to the default model for high-reasoning prompts", () => {
		expect(
			routeWorkspaceAiAutoModel(
				buildSignals({ lastUserTextChars: 2_000, messageCount: 4, totalTextChars: 2_400 }),
			),
		).toEqual({
			gatewayModel: "moonshotai/kimi-k2.6",
			modelId: "auto",
			reason: "high-reasoning-default",
		});
	});

	it("prefers capability rules over the simple-chat rule", () => {
		const route = routeWorkspaceAiAutoModel(
			buildSignals({ attachmentCount: 1, lastUserTextChars: 20, messageCount: 1 }),
		);

		expect(route.reason).toBe("attachment-heavy");
	});

	it("treats threshold boundary values consistently", () => {
		const thresholds = WORKSPACE_AI_AUTO_ROUTING_THRESHOLDS;

		expect(
			routeWorkspaceAiAutoModel(
				buildSignals({
					lastUserTextChars: thresholds.simpleChatMaxLastUserTextChars,
					messageCount: thresholds.simpleChatMaxMessageCount,
				}),
			).reason,
		).toBe("simple-chat");

		expect(
			routeWorkspaceAiAutoModel(
				buildSignals({
					lastUserTextChars: thresholds.simpleChatMaxLastUserTextChars + 1,
					messageCount: 1,
				}),
			).reason,
		).toBe("high-reasoning-default");

		expect(
			routeWorkspaceAiAutoModel(
				buildSignals({
					lastUserTextChars: 100,
					totalTextChars: thresholds.longContextTotalTextChars,
				}),
			).reason,
		).toBe("long-context");

		expect(
			routeWorkspaceAiAutoModel(
				buildSignals({
					lastUserTextChars: 100,
					messageCount: 2,
					totalTextChars: thresholds.longContextTotalTextChars - 1,
				}),
			).reason,
		).toBe("simple-chat");
	});

	it("never routes into a premium billing tier", () => {
		const premiumRule: WorkspaceAiAutoRoutingRule = {
			matches: () => true,
			reason: "tool-heavy",
			targetModelId: "claude-sonnet",
		};

		expect(routeWorkspaceAiAutoModel(buildSignals(), [premiumRule])).toEqual({
			gatewayModel: "moonshotai/kimi-k2.6",
			modelId: "auto",
			reason: "fallback-unavailable",
		});
	});

	it("falls back safely when a routed model has been removed", () => {
		const staleRule: WorkspaceAiAutoRoutingRule = {
			matches: () => true,
			reason: "simple-chat",
			targetModelId: "removed-model" as WorkspaceAiChatModelId,
		};

		expect(routeWorkspaceAiAutoModel(buildSignals(), [staleRule])).toEqual({
			gatewayModel: "moonshotai/kimi-k2.6",
			modelId: "auto",
			reason: "fallback-unavailable",
		});
	});
});

describe("workspace AI routing signal extraction", () => {
	it("extracts text, attachment, and tool-call signals from turn messages", () => {
		const signals = extractWorkspaceAiRoutingSignals(
			buildTurnContext({
				messages: [
					{ role: "user", content: "Summarize this photo" },
					{
						role: "assistant",
						content: [
							{ type: "text", text: "Sure." },
							{ type: "tool-call", toolCallId: "call-1", toolName: "compute", input: {} },
						],
					},
					{
						role: "user",
						content: [
							{ type: "text", text: "What about this one?" },
							{ type: "image", image: "data:image/png;base64,AAAA" },
							{ type: "file", data: "AAAA", mediaType: "image/png" },
						],
					},
				],
			} as Partial<TurnContext>),
		);

		expect(signals).toEqual({
			attachmentCount: 2,
			hasCodeSignals: false,
			lastUserTextChars: "What about this one?".length,
			messageCount: 3,
			priorToolCallCount: 1,
			totalTextChars: ("Summarize this photo" + "Sure." + "What about this one?").length,
			workspaceReferenceCount: 0,
		});
	});

	it("detects code signals in the latest user message", () => {
		const signals = extractWorkspaceAiRoutingSignals(
			buildTurnContext({
				messages: [{ role: "user", content: "Fix this:\n```ts\nconst a = 1\n```" }],
			} as Partial<TurnContext>),
		);

		expect(signals.hasCodeSignals).toBe(true);
	});

	it("counts workspace references from the request body", () => {
		const signals = extractWorkspaceAiRoutingSignals(
			buildTurnContext({
				body: {
					workspaceAiContext: {
						selectedItems: [{ id: "a" }, { id: "b" }],
						selectedQuotes: [{ text: "quoted" }],
					},
				},
			}),
		);

		expect(signals.workspaceReferenceCount).toBe(3);
	});

	it("returns zero signals for missing or malformed turn data", () => {
		expect(
			extractWorkspaceAiRoutingSignals(
				buildTurnContext({
					body: { workspaceAiContext: "garbage" },
					messages: [null, 42, { role: "user", content: { nested: true } }],
				} as unknown as Partial<TurnContext>),
			),
		).toEqual({
			attachmentCount: 0,
			hasCodeSignals: false,
			lastUserTextChars: 0,
			messageCount: 3,
			priorToolCallCount: 0,
			totalTextChars: 0,
			workspaceReferenceCount: 0,
		});

		expect(
			extractWorkspaceAiRoutingSignals({ messages: undefined } as unknown as TurnContext),
		).toEqual({
			attachmentCount: 0,
			hasCodeSignals: false,
			lastUserTextChars: 0,
			messageCount: 0,
			priorToolCallCount: 0,
			totalTextChars: 0,
			workspaceReferenceCount: 0,
		});
	});
});
