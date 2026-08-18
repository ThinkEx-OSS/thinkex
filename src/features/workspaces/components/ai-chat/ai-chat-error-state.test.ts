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
		).toEqual({ classification: null, kind: "assistant", message: null });
	});

	it("names the plan limit rather than a crash when the server refuses the turn", () => {
		expect(
			deriveAiChatAssistantErrorState({
				chatError: new Error(
					JSON.stringify({ error: "Usage limit reached. Resets 2026-09-01.", status: 429 }),
				),
				chatStatus: "error",
				hasConnectionError: false,
				hasMessages: true,
			}),
		).toEqual({
			classification: "usage_limit",
			kind: "assistant",
			message: "Usage limit reached. Resets 2026-09-01.",
		});
	});

	it("shows another refusal's own wording without calling it a limit", () => {
		expect(
			deriveAiChatAssistantErrorState({
				chatError: new Error(
					JSON.stringify({ error: "A response is already being generated", status: 409 }),
				),
				chatStatus: "error",
				hasConnectionError: false,
				hasMessages: true,
			}),
		).toEqual({
			classification: null,
			kind: "assistant",
			message: "A response is already being generated",
		});
	});

	it("leaves a transport failure that isn't ours as a plain error", () => {
		expect(
			deriveAiChatAssistantErrorState({
				chatError: new Error("<html>502 Bad Gateway</html>"),
				chatStatus: "error",
				hasConnectionError: false,
				hasMessages: true,
			}),
		).toEqual({ classification: null, kind: "assistant", message: null });
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
