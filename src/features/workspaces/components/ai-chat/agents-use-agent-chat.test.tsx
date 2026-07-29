// @vitest-environment jsdom

import type { useAgent } from "agents/react";
import { useAgentChat } from "agents/chat/react";
import type { UIMessage } from "ai";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

type AgentChat = ReturnType<typeof useAgentChat>;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function createFakeAgent() {
	const target = new EventTarget();
	const sentFrames: string[] = [];
	const url = "ws://localhost:3000/agents/chat/thread-1?_pk=test";
	const agent = {
		_pk: "thread-1",
		_pkurl: url,
		_url: null,
		addEventListener: target.addEventListener.bind(target),
		agent: "Chat",
		close: () => undefined,
		dispatchEvent: target.dispatchEvent.bind(target),
		getHttpUrl: () => url.replace("ws://", "http://"),
		id: "fake-agent",
		name: "thread-1",
		path: [{ agent: "Chat", name: "thread-1" }],
		removeEventListener: target.removeEventListener.bind(target),
		send: (frame: string) => sentFrames.push(frame),
		shouldReconnect: true,
	};

	return {
		agent: agent as unknown as ReturnType<typeof useAgent>,
		close: () => target.dispatchEvent(new Event("close")),
		open: () => target.dispatchEvent(new Event("open")),
		sentFrames,
		target,
	};
}

function dispatch(target: EventTarget, frame: Record<string, unknown>) {
	target.dispatchEvent(
		new MessageEvent("message", {
			data: JSON.stringify(frame),
		}),
	);
}

function countFrames(sentFrames: string[], type: string) {
	return sentFrames
		.map((frame) => JSON.parse(frame) as { type?: string })
		.filter((frame) => frame.type === type).length;
}

function dispatchChunk(
	target: EventTarget,
	id: string,
	chunk: Record<string, unknown>,
	options: { replay?: boolean; replayComplete?: boolean } = {},
) {
	dispatch(target, {
		body: JSON.stringify(chunk),
		continuation: true,
		id,
		replay: options.replay ?? false,
		replayComplete: options.replayComplete,
		type: "cf_agent_use_chat_response",
	});
}

function dispatchContinuation(
	target: EventTarget,
	requestId: string,
	textId: string,
	replay = false,
) {
	dispatchChunk(target, requestId, { messageId: "assistant-1", type: "start" }, { replay });
	dispatchChunk(target, requestId, { id: textId, type: "text-start" }, { replay });
	dispatchChunk(
		target,
		requestId,
		{ delta: "already streamed", id: textId, type: "text-delta" },
		{ replay, replayComplete: replay },
	);
}

function lastAssistant(messages: UIMessage[] | undefined) {
	if (!messages) return;
	for (let index = messages.length - 1; index >= 0; index--) {
		if (messages[index]?.role === "assistant") return messages[index];
	}
}

function assistantText(messages: UIMessage[] | undefined) {
	const assistant = lastAssistant(messages);
	return (
		assistant?.parts
			.filter(
				(part): part is Extract<(typeof assistant.parts)[number], { type: "text" }> =>
					part.type === "text",
			)
			.map((part) => part.text)
			.join("") ?? ""
	);
}

function assistantHasTool(messages: UIMessage[] | undefined) {
	return lastAssistant(messages)?.parts.some((part) => part.type === "dynamic-tool") ?? false;
}

function continuationBaseline() {
	return [
		{
			id: "user-1",
			parts: [{ text: "Research this", type: "text" }],
			role: "user",
		},
		{
			id: "assistant-1",
			parts: [
				{
					input: { query: "topic" },
					output: { result: "found" },
					state: "output-available",
					toolCallId: "tool-1",
					toolName: "search",
					type: "dynamic-tool",
				},
			],
			role: "assistant",
		},
	] satisfies UIMessage[];
}

describe("agents useAgentChat observer", () => {
	let root: ReturnType<typeof createRoot> | undefined;
	let container: HTMLDivElement | undefined;

	async function mountChat(agent: ReturnType<typeof useAgent>, messages: UIMessage[]) {
		let chat: AgentChat | undefined;

		function TestComponent() {
			const current = useAgentChat({
				agent,
				getInitialMessages: null,
				messages,
			});
			useEffect(() => {
				chat = current;
			}, [current]);
			return null;
		}

		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		await act(async () => root?.render(<TestComponent />));
		await vi.waitFor(() => expect(chat).toBeDefined());

		return () => chat;
	}

	afterEach(async () => {
		if (root) {
			await act(async () => root?.unmount());
		}
		container?.remove();
		vi.restoreAllMocks();
		root = undefined;
		container = undefined;
	});

	it("terminates observed error frames without parsing them as message chunks", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const { agent, sentFrames, target } = createFakeAgent();
		const chat = await mountChat(agent, []);

		await vi.waitFor(() => {
			expect(countFrames(sentFrames, "cf_agent_stream_resume_request")).toBe(1);
		});

		await act(async () => {
			dispatch(target, {
				reason: "idle",
				type: "cf_agent_stream_resume_none",
			});
		});
		await act(async () => {
			dispatch(target, {
				id: "errored-stream",
				type: "cf_agent_stream_resuming",
			});
		});
		await vi.waitFor(() => expect(chat()?.isServerStreaming).toBe(true));

		await act(async () => {
			dispatch(target, {
				body: "Network connection lost.",
				done: true,
				error: true,
				id: "errored-stream",
				replay: true,
				type: "cf_agent_use_chat_response",
			});
		});

		await vi.waitFor(() => {
			expect(chat()?.isServerStreaming).toBe(false);
			expect(chat()?.messages).toEqual([]);
		});
		expect(warn).not.toHaveBeenCalled();
	});

	it("does not duplicate a transport-owned continuation when its buffered prefix replays", async () => {
		const { agent, close, open, sentFrames, target } = createFakeAgent();
		const chat = await mountChat(agent, continuationBaseline());

		await vi.waitFor(() => {
			expect(countFrames(sentFrames, "cf_agent_stream_resume_request")).toBe(1);
		});
		await act(async () => {
			dispatch(target, {
				id: "continuation-1",
				type: "cf_agent_stream_resuming",
			});
		});
		await vi.waitFor(() => {
			expect(countFrames(sentFrames, "cf_agent_stream_resume_ack")).toBe(1);
		});

		await act(async () => {
			dispatchContinuation(target, "continuation-1", "text-1");
		});
		await vi.waitFor(() => {
			expect(assistantText(chat()?.messages)).toBe("already streamed");
			expect(assistantHasTool(chat()?.messages)).toBe(true);
		});

		await act(async () => {
			close();
			open();
		});
		await vi.waitFor(() => {
			expect(countFrames(sentFrames, "cf_agent_stream_resume_request")).toBe(2);
		});
		await act(async () => {
			dispatch(target, {
				id: "continuation-1",
				type: "cf_agent_stream_resuming",
			});
		});
		await vi.waitFor(() => {
			expect(countFrames(sentFrames, "cf_agent_stream_resume_ack")).toBe(2);
		});

		await act(async () => {
			dispatchContinuation(target, "continuation-1", "text-1", true);
		});

		await vi.waitFor(() => {
			expect(assistantText(chat()?.messages)).toBe("already streamed");
		});
	});

	it("does not duplicate a fallback continuation when its buffered prefix replays", async () => {
		const { agent, close, open, sentFrames, target } = createFakeAgent();
		const chat = await mountChat(agent, continuationBaseline());

		await vi.waitFor(() => {
			expect(countFrames(sentFrames, "cf_agent_stream_resume_request")).toBe(1);
		});
		await act(async () => {
			dispatch(target, {
				reason: "idle",
				type: "cf_agent_stream_resume_none",
			});
			dispatch(target, {
				id: "continuation-2",
				type: "cf_agent_stream_resuming",
			});
		});

		await act(async () => {
			dispatchContinuation(target, "continuation-2", "text-2");
		});
		await vi.waitFor(() => {
			expect(assistantText(chat()?.messages)).toBe("already streamed");
			expect(assistantHasTool(chat()?.messages)).toBe(true);
		});

		await act(async () => {
			close();
			open();
		});
		await vi.waitFor(() => {
			expect(countFrames(sentFrames, "cf_agent_stream_resume_request")).toBe(2);
		});
		await act(async () => {
			dispatch(target, {
				id: "continuation-2",
				type: "cf_agent_stream_resuming",
			});
		});

		await act(async () => {
			dispatchContinuation(target, "continuation-2", "text-2", true);
		});

		await vi.waitFor(() => {
			expect(assistantText(chat()?.messages)).toBe("already streamed");
		});
	});
});
