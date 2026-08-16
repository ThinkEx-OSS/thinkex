import { describe, expect, it } from "vitest";

import { deriveAiChatAssistantErrorState } from "#/features/workspaces/components/ai-chat/ai-chat-error-state";

describe("AI chat error state", () => {
	it("surfaces a current SDK request error instead of masking it as ready", () => {
		expect(
			deriveAiChatAssistantErrorState({
				chatStatus: "error",
				hasConnectionError: false,
			}),
		).toEqual({ kind: "assistant" });
	});

	it("preserves server details for a current SDK request error", () => {
		expect(
			deriveAiChatAssistantErrorState({
				chatStatus: "error",
				hasConnectionError: false,
				threadSummary: {
					lastErrorClassification: "context_overflow",
					lastErrorStage: "recovery",
					lastRunResult: "error",
				},
			}),
		).toEqual({
			classification: "context_overflow",
			kind: "assistant",
			stage: "recovery",
		});
	});

	it("flags a run stopped before the first token so the send visibly ended", () => {
		expect(
			deriveAiChatAssistantErrorState({
				chatStatus: "ready",
				hasConnectionError: false,
				lastMessageRole: "user",
				threadSummary: {
					lastErrorClassification: null,
					lastErrorStage: null,
					lastRunResult: "aborted",
				},
			}),
		).toEqual({ kind: "aborted" });
	});

	it("stays quiet for a mid-stream stop that kept its partial reply", () => {
		expect(
			deriveAiChatAssistantErrorState({
				chatStatus: "ready",
				hasConnectionError: false,
				lastMessageRole: "assistant",
				threadSummary: {
					lastErrorClassification: null,
					lastErrorStage: null,
					lastRunResult: "aborted",
				},
			}),
		).toBeNull();
	});

	it("keeps a terminal connection error distinct", () => {
		expect(
			deriveAiChatAssistantErrorState({
				chatStatus: "error",
				hasConnectionError: true,
			}),
		).toEqual({ kind: "connection" });
	});

	it("keeps a terminal connection error visible while a request is pending", () => {
		expect(
			deriveAiChatAssistantErrorState({
				chatStatus: "submitted",
				hasConnectionError: true,
			}),
		).toEqual({ kind: "connection" });
	});
});
