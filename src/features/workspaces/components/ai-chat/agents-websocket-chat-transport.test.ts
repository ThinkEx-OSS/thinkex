import type { UIMessage } from "ai";
import { WebSocketChatTransport } from "agents/chat/react";
import { describe, expect, it } from "vitest";

class ReconnectingAgentConnection {
	private readonly target = new EventTarget();
	sentFrames: string[] = [];

	addEventListener(
		type: string,
		listener: (event: MessageEvent) => void,
		options?: { signal?: AbortSignal },
	) {
		this.target.addEventListener(type, listener as EventListener, options);
	}

	removeEventListener(type: string, listener: (event: MessageEvent) => void) {
		this.target.removeEventListener(type, listener as EventListener);
	}

	send(data: string) {
		this.sentFrames.push(data);
	}

	disconnect() {
		this.target.dispatchEvent(new Event("close"));
	}
}

describe("agents WebSocket chat transport", () => {
	it("errors the request stream when its socket disconnects", async () => {
		const agent = new ReconnectingAgentConnection();
		const transport = new WebSocketChatTransport({
			agent,
		});
		const stream = await transport.sendMessages({
			abortSignal: undefined,
			body: undefined,
			chatId: "thread-1",
			headers: undefined,
			messageId: "message-1",
			messages: [
				{
					id: "message-1",
					parts: [{ type: "text", text: "Hello" }],
					role: "user",
				},
			] satisfies UIMessage[],
			metadata: undefined,
			trigger: "submit-message",
		});
		const firstRead = stream.getReader().read();

		agent.disconnect();

		await expect(firstRead).rejects.toThrow("Chat connection interrupted");
	});
});
