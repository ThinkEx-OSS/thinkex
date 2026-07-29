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
