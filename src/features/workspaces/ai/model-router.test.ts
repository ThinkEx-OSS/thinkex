import { describe, expect, it } from "vitest";

import {
	routeWorkspaceAiAutoModel,
	WORKSPACE_AI_AUTO_ROUTING_THRESHOLDS,
	type WorkspaceAiAutoRoutingRule,
	type WorkspaceAiRoutingSignals,
} from "#/features/workspaces/ai/model-router";
import type { WorkspaceAiChatModelId } from "#/features/workspaces/ai/models";

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
