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

	it("errors a resumed stream when its socket disconnects", async () => {
		const agent = new ReconnectingAgentConnection();
		const transport = new WebSocketChatTransport({ agent });
		const pendingStream = transport.reconnectToStream({ chatId: "thread-1" });

		expect(transport.handleStreamResuming({ id: "request-1" })).toBe(true);
		const stream = await pendingStream;
		if (!stream) throw new Error("Expected a resumed stream");
		const firstRead = stream.getReader().read();

		agent.disconnect();

		await expect(firstRead).rejects.toThrow("Chat connection interrupted");
	});

	it("only errors a tool continuation after it owns a server request", async () => {
		const beforeResumeAgent = new ReconnectingAgentConnection();
		const beforeResumeTransport = new WebSocketChatTransport({ agent: beforeResumeAgent });
		beforeResumeTransport.expectToolContinuation();
		const waitingStream = await beforeResumeTransport.reconnectToStream({ chatId: "thread-1" });
		if (!waitingStream) throw new Error("Expected a waiting tool continuation stream");
		const waitingRead = waitingStream.getReader().read();
		beforeResumeAgent.disconnect();
		await expect(waitingRead).resolves.toEqual({ done: true, value: undefined });

		const activeAgent = new ReconnectingAgentConnection();
		const activeTransport = new WebSocketChatTransport({ agent: activeAgent });
		activeTransport.expectToolContinuation();
		const activeStream = await activeTransport.reconnectToStream({ chatId: "thread-1" });
		if (!activeStream) throw new Error("Expected an active tool continuation stream");
		expect(activeTransport.handleStreamResuming({ id: "request-2" })).toBe(true);
		const activeRead = activeStream.getReader().read();
		activeAgent.disconnect();

		await expect(activeRead).rejects.toThrow("Chat connection interrupted");
	});
});
