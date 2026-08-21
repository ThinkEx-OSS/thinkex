import { describe, expect, it } from "vitest";

import type { AiChatMessage } from "#/features/workspaces/components/ai-chat/types";
import { serverTranscriptAdvanced } from "#/features/workspaces/components/ai-chat/ai-chat-transcript-recovery";

describe("server transcript recovery", () => {
	it("keeps an unpersisted user tail after a refused request", () => {
		expect(serverTranscriptAdvanced([userMessage("new", "retry")], [])).toBe(false);
	});

	it("adopts a reply written after the browser stream failed", () => {
		const user = userMessage("user-1", "hello");
		expect(serverTranscriptAdvanced([user], [user, assistantMessage("reply-1", "hello")])).toBe(
			true,
		);
	});

	it("ignores an unchanged pre-request transcript", () => {
		const assistant = assistantMessage("reply-1", "old reply");
		expect(serverTranscriptAdvanced([assistant], [assistant])).toBe(false);
	});

	it("adopts durable metadata missing from the local assistant row", () => {
		const local = assistantMessage("reply-1", "partial");
		const stored = { ...local, metadata: { turnStatus: "interrupted" } };
		expect(serverTranscriptAdvanced([local], [stored])).toBe(true);
	});
});

function userMessage(id: string, text: string): AiChatMessage {
	return { id, role: "user", parts: [{ type: "text", text }] };
}

function assistantMessage(id: string, text: string): AiChatMessage {
	return { id, role: "assistant", parts: [{ type: "text", text }] };
}
