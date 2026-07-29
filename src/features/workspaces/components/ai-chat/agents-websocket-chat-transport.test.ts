import type { UIMessage } from "ai";
import { WebSocketChatTransport } from "agents/chat/react";
import { describe, expect, it, vi } from "vitest";

class ReconnectingAgentConnection {
	private readonly target = new EventTarget();
	sentFrames: string[] = [];
	shouldReconnect = true;

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

	reconnect() {
		this.target.dispatchEvent(new Event("open"));
	}

	closePermanently() {
		this.shouldReconnect = false;
		this.disconnect();
	}

	receive(data: unknown) {
		this.target.dispatchEvent(
			new MessageEvent("message", {
				data: JSON.stringify(data),
			}),
		);
	}
}

describe("agents WebSocket chat transport", () => {
	it("keeps the request stream alive across a transient socket close", async () => {
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
		const request = JSON.parse(agent.sentFrames[0] ?? "{}") as { id?: string };
		const reader = stream.getReader();
		const firstRead = reader.read();

		agent.disconnect();

		await expect(
			Promise.race([
				firstRead.then(() => "settled"),
				new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 0)),
			]),
		).resolves.toBe("pending");

		agent.receive({
			body: "",
			done: true,
			id: request.id,
			type: "cf_agent_use_chat_response",
		});

		await expect(firstRead).resolves.toEqual({ done: true, value: undefined });
	});

	it("errors the request stream when the connection closes permanently", async () => {
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

		agent.closePermanently();

		await expect(firstRead).rejects.toThrow("Chat connection closed");
	});

	it("errors the request stream when a transient close never recovers", async () => {
		vi.useFakeTimers();

		try {
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
			const rejection = expect(firstRead).rejects.toThrow("Chat connection did not recover");

			agent.disconnect();
			await vi.advanceTimersByTimeAsync(60_000);

			await rejection;
		} finally {
			vi.useRealTimers();
		}
	});

	it("clears the reconnect deadline when the socket reopens", async () => {
		vi.useFakeTimers();

		try {
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
			const request = JSON.parse(agent.sentFrames[0] ?? "{}") as { id?: string };
			const firstRead = stream.getReader().read();

			agent.disconnect();
			agent.reconnect();
			await vi.advanceTimersByTimeAsync(60_000);
			agent.receive({
				body: "",
				done: true,
				id: request.id,
				type: "cf_agent_use_chat_response",
			});

			await expect(firstRead).resolves.toEqual({ done: true, value: undefined });
		} finally {
			vi.useRealTimers();
		}
	});
});
