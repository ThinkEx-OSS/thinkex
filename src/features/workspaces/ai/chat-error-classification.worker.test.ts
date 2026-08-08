import { describe, expect, it } from "vitest";

import { classifyAIThreadChatError } from "#/features/workspaces/ai/chat-error-classification";

describe("classifyAIThreadChatError", () => {
	// The payload that reached production: a rate limit delivered as an in-stream
	// error event, not a request-time 429.
	it("classifies an in-stream provider rate limit", () => {
		const error = new Error(
			'{"type":"error","sequence_number":2,"error":{"code":"rate_limit_exceeded","message":"Rate limit reached for gpt-5.6-luna on tokens per min (TPM): Limit 200000"}}',
		);

		expect(classifyAIThreadChatError(error)).toBe("rate_limit");
	});

	it("classifies provider overload the same way", () => {
		expect(classifyAIThreadChatError(new Error("Vertex AI is overloaded."))).toBe("rate_limit");
	});

	// Overflow is the only classification Think acts on, so it must not be shadowed.
	it("still classifies context overflow", () => {
		expect(classifyAIThreadChatError(new Error("prompt is too long: 250000 tokens"))).toBe(
			"context_overflow",
		);
	});

	// Guards the reason the pattern matches names, not status codes.
	it("ignores an unrelated error that merely contains 429", () => {
		expect(classifyAIThreadChatError(new Error("parse failed at line 429"))).toBeUndefined();
	});
});
