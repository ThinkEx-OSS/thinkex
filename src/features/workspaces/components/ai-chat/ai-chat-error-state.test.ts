import { describe, expect, it } from "vitest";

import { deriveAiChatAssistantErrorState } from "#/features/workspaces/components/ai-chat/ai-chat-error-state";

describe("AI chat error state", () => {
	it("surfaces a current SDK request error instead of masking it as ready", () => {
		expect(
			deriveAiChatAssistantErrorState({
				chatStatus: "error",
				hasConnectionError: false,
				hasMessages: true,
			}),
		).toEqual({ kind: "assistant" });
	});

	it("flags a turn that ended without assistant output so the send visibly ended", () => {
		expect(
			deriveAiChatAssistantErrorState({
				chatStatus: "ready",
				hasConnectionError: false,
				hasMessages: true,
				lastMessageRole: "user",
			}),
		).toEqual({ kind: "aborted" });
	});

	it("stays quiet for a mid-stream stop that kept its partial reply", () => {
		expect(
			deriveAiChatAssistantErrorState({
				chatStatus: "ready",
				hasConnectionError: false,
				hasMessages: true,
				lastMessageRole: "assistant",
			}),
		).toBeNull();
	});

	it("stays quiet on an empty draft thread", () => {
		expect(
			deriveAiChatAssistantErrorState({
				chatStatus: "ready",
				hasConnectionError: false,
				hasMessages: false,
			}),
		).toBeNull();
	});

	it("keeps a terminal connection error distinct", () => {
		expect(
			deriveAiChatAssistantErrorState({
				chatStatus: "error",
				hasConnectionError: true,
				hasMessages: true,
			}),
		).toEqual({ kind: "connection" });
	});

	it("keeps a terminal connection error visible while a request is pending", () => {
		expect(
			deriveAiChatAssistantErrorState({
				chatStatus: "submitted",
				hasConnectionError: true,
				hasMessages: true,
			}),
		).toEqual({ kind: "connection" });
	});
});
