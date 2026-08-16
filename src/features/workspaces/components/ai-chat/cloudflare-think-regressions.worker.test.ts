import { Think } from "@cloudflare/think";
import type { DynamicToolUIPart, ModelMessage, UIMessage, UIMessageChunk } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

interface PersistIncomingMessageHarness {
	_stripReservedMessageMetadata: (message: UIMessage) => UIMessage;
	_upsertMessageInHistory: (message: UIMessage) => Promise<void>;
}

interface StallRecoveryHarness {
	_activeChatRecoveryRootRequestId?: string;
	_beginChatRecoveryIncident: (input: Record<string, unknown>) => Promise<{
		config: Record<string, unknown>;
		exhausted: boolean;
		incident: { firstSeenAt: number; incidentId: string };
	}>;
	_chatRecoveryEngine: () => {
		scheduleRecovery: (input: Record<string, unknown>) => Promise<void>;
	};
	_hasRunningSubmission: (requestId: string) => boolean;
	_lastBody?: Record<string, unknown>;
	_lastClientTools?: Record<string, unknown>;
	_resolveChatRecoveryConfig: () => { enabled: boolean };
	messages: UIMessage[];
}

interface ThinkRegressionInternals {
	_assembleModelMessages: (
		this: ModelMessageAssemblyHarness,
		tools: Record<string, never>,
	) => Promise<ModelMessage[]>;
	_persistIncomingMessage: (
		this: PersistIncomingMessageHarness,
		message: UIMessage,
	) => Promise<void>;
	_routeStallToBoundedRecovery: (
		this: StallRecoveryHarness,
		input: {
			partialParts: UIMessage["parts"];
			requestId: string;
			streamId: string;
			targetAssistantId?: string;
		},
	) => Promise<"disabled" | "exhausted" | "scheduled">;
	_streamResult: (
		this: StreamResultHarness,
		requestId: string,
		result: StreamResult,
		abortSignal?: AbortSignal,
	) => Promise<{ status: "aborted" | "completed" | "error" }>;
}

interface StreamResult {
	toUIMessageStream: (options: {
		onError: (error: unknown) => string;
	}) => AsyncIterable<UIMessageChunk>;
}

interface StreamResultHarness {
	_alignStreamStartId: (
		chunk: UIMessageChunk,
		action: unknown,
		accumulator: unknown,
		continuation: boolean,
	) => void;
	_annotateActionApprovalChunk: (
		requestId: string,
		chunk: UIMessageChunk,
		pendingActions: Map<unknown, unknown>,
		parts: UIMessage["parts"],
	) => UIMessageChunk;
	_applyActionApprovalDescriptorToParts: (chunk: UIMessageChunk, parts: UIMessage["parts"]) => void;
	_broadcastChat: (message: { done: boolean; error?: boolean }) => void;
	_broadcastMessages: () => void;
	_completeResumableStream: (streamId: string) => void;
	_continuation: { pending: null };
	_drainInferenceStream: (result: StreamResult) => void;
	_errorResumableStream: (streamId: string) => void;
	_fireResponseHook: (input: Record<string, unknown>) => Promise<void>;
	_insideInferenceLoop: boolean;
	_onStreamingTurnFinalized: () => void;
	_pendingResumeConnections: Set<string>;
	_persistAssistantMessage: (message: UIMessage, parentId?: string) => Promise<void>;
	_programmaticStreamErrors: Map<string, string>;
	_startResumableStream: (requestId: string) => string;
	_storeChunkDurably: (
		streamId: string,
		chunk: UIMessageChunk,
		body: string,
		state: { chunksSinceFlush: number; hasFlushedContent: boolean },
	) => Promise<void>;
	_streamingAssistant: unknown;
	_turnQueue: { generation: number };
	chatStreamStallTimeoutMs: number;
}

interface ModelMessageAssemblyHarness {
	_emit: () => void;
	_incompleteToolCallIds: () => string[];
	_repairTranscriptForProvider: (messages: UIMessage[]) => Promise<UIMessage[]>;
	messages: UIMessage[];
	modelMessageUrlBase?: string | URL;
}

const thinkInternals = Think.prototype as unknown as ThinkRegressionInternals;

afterEach(() => {
	vi.restoreAllMocks();
});

function userMessage(id: string, text: string): UIMessage {
	return {
		id,
		parts: [{ type: "text", text }],
		role: "user",
	};
}

function toolMessage(
	id: string,
	toolCallId: string,
	state: "input-available" | "output-available",
): UIMessage {
	const part: DynamicToolUIPart =
		state === "output-available"
			? {
					input: { query: id },
					output: { answer: id },
					state,
					toolCallId,
					toolName: "search",
					type: "dynamic-tool",
				}
			: {
					input: { query: id },
					state,
					toolCallId,
					toolName: "search",
					type: "dynamic-tool",
				};

	return {
		id,
		parts: [part],
		role: "assistant",
	};
}

describe("Cloudflare Think regression shields", () => {
	it("resolves relative attachment URLs before AI SDK model conversion", async () => {
		const messages: UIMessage[] = [
			{
				id: "user-with-file",
				parts: [
					{
						filename: "diagram.png",
						mediaType: "image/png",
						type: "file",
						url: "/api/v1/workspaces/workspace-1/ai-threads/thread-1/attachments/file-1",
					},
				],
				role: "user",
			},
		];
		const harness: ModelMessageAssemblyHarness = {
			_emit: () => undefined,
			_incompleteToolCallIds: () => [],
			_repairTranscriptForProvider: async (input) => input,
			messages,
			modelMessageUrlBase: "https://thinkex.app",
		};

		const result = await thinkInternals._assembleModelMessages.call(harness, {});

		expect(result).toEqual([
			{
				content: [
					{
						data: {
							type: "url",
							url: new URL(
								"https://thinkex.app/api/v1/workspaces/workspace-1/ai-threads/thread-1/attachments/file-1",
							),
						},
						filename: "diagram.png",
						mediaType: "image/png",
						type: "file",
					},
				],
				role: "user",
			},
		]);
	});

	it("does not persist synthetic compaction summaries as real messages", async () => {
		const upsert = vi.fn<(message: UIMessage) => Promise<void>>().mockResolvedValue();
		const harness: PersistIncomingMessageHarness = {
			_stripReservedMessageMetadata: (message) => message,
			_upsertMessageInHistory: upsert,
		};

		await thinkInternals._persistIncomingMessage.call(harness, {
			id: "compaction_summary-1",
			parts: [{ type: "text", text: "Synthetic summary" }],
			role: "assistant",
		});

		expect(upsert).not.toHaveBeenCalled();

		const normal = userMessage("user-1", "Keep me");
		await thinkInternals._persistIncomingMessage.call(harness, normal);
		expect(upsert).toHaveBeenCalledExactlyOnceWith(normal);
	});

	it("retries a stalled turn when no assistant response exists yet", async () => {
		const scheduleRecovery = vi
			.fn<(input: Record<string, unknown>) => Promise<void>>()
			.mockResolvedValue();
		const beginIncident = vi
			.fn<
				(input: Record<string, unknown>) => Promise<{
					config: Record<string, unknown>;
					exhausted: boolean;
					incident: { firstSeenAt: number; incidentId: string };
				}>
			>()
			.mockResolvedValue({
				config: {},
				exhausted: false,
				incident: { firstSeenAt: 1, incidentId: "incident-1" },
			});
		const harness: StallRecoveryHarness = {
			_beginChatRecoveryIncident: beginIncident,
			_chatRecoveryEngine: () => ({ scheduleRecovery }),
			_hasRunningSubmission: () => false,
			_resolveChatRecoveryConfig: () => ({ enabled: true }),
			messages: [userMessage("user-1", "Hello")],
		};

		await expect(
			thinkInternals._routeStallToBoundedRecovery.call(harness, {
				partialParts: [],
				requestId: "request-1",
				streamId: "stream-1",
			}),
		).resolves.toBe("scheduled");

		expect(beginIncident).toHaveBeenCalledWith(
			expect.objectContaining({
				latestUserMessageId: "user-1",
				recoveryKind: "retry",
			}),
		);
		expect(scheduleRecovery).toHaveBeenCalledWith(
			expect.objectContaining({
				callback: "_chatRecoveryRetry",
				data: expect.objectContaining({ targetUserId: "user-1" }),
				recoveryKind: "retry",
			}),
		);
	});

	it("continues a stalled turn when partial assistant output exists", async () => {
		const scheduleRecovery = vi
			.fn<(input: Record<string, unknown>) => Promise<void>>()
			.mockResolvedValue();
		const harness: StallRecoveryHarness = {
			_beginChatRecoveryIncident: async () => ({
				config: {},
				exhausted: false,
				incident: { firstSeenAt: 1, incidentId: "incident-1" },
			}),
			_chatRecoveryEngine: () => ({ scheduleRecovery }),
			_hasRunningSubmission: () => false,
			_resolveChatRecoveryConfig: () => ({ enabled: true }),
			messages: [userMessage("user-1", "Hello")],
		};

		await thinkInternals._routeStallToBoundedRecovery.call(harness, {
			partialParts: [{ type: "text", text: "Partial" }],
			requestId: "request-1",
			streamId: "stream-1",
			targetAssistantId: "assistant-1",
		});

		expect(scheduleRecovery).toHaveBeenCalledWith(
			expect.objectContaining({
				callback: "_chatRecoveryContinue",
				data: expect.objectContaining({ targetAssistantId: "assistant-1" }),
				recoveryKind: "continue",
			}),
		);
	});

	it("preserves distinct assistant rows when a provider reuses a tool-call ID", async () => {
		const persisted: UIMessage[] = [];
		const harness: PersistIncomingMessageHarness = {
			_stripReservedMessageMetadata: (message) => message,
			_upsertMessageInHistory: async (message) => {
				persisted.push(message);
			},
		};
		const first = toolMessage("assistant-first", "call-reused", "output-available");
		const incoming = [first, toolMessage("assistant-second", "call-reused", "input-available")];

		for (const message of incoming) {
			await thinkInternals._persistIncomingMessage.call(harness, message);
		}

		expect(persisted.map((message) => message.id)).toEqual(["assistant-first", "assistant-second"]);
	});

	it("broadcasts the persisted transcript before marking a streamed turn done", async () => {
		const events: string[] = [];
		const chunks: UIMessageChunk[] = [
			{ messageId: "assistant-1", type: "start" },
			{ id: "text-1", type: "text-start" },
			{ delta: "Answer", id: "text-1", type: "text-delta" },
			{ id: "text-1", type: "text-end" },
		];
		const result: StreamResult = {
			toUIMessageStream: async function* () {
				for (const chunk of chunks) {
					yield chunk;
				}
			},
		};
		const harness: StreamResultHarness = {
			_alignStreamStartId: () => undefined,
			_annotateActionApprovalChunk: (_requestId, chunk) => chunk,
			_applyActionApprovalDescriptorToParts: () => undefined,
			_broadcastChat: (message) => {
				if (message.done) events.push("done");
			},
			_broadcastMessages: () => events.push("snapshot"),
			_completeResumableStream: () => events.push("complete"),
			_continuation: { pending: null },
			_drainInferenceStream: () => undefined,
			_errorResumableStream: () => undefined,
			_fireResponseHook: async () => undefined,
			_insideInferenceLoop: false,
			_onStreamingTurnFinalized: () => undefined,
			_pendingResumeConnections: new Set(),
			_persistAssistantMessage: async () => {
				events.push("persist");
			},
			_programmaticStreamErrors: new Map(),
			_startResumableStream: () => "stream-1",
			_storeChunkDurably: async () => undefined,
			_streamingAssistant: null,
			_turnQueue: { generation: 1 },
			chatStreamStallTimeoutMs: 30_000,
		};

		await expect(thinkInternals._streamResult.call(harness, "request-1", result)).resolves.toEqual({
			status: "completed",
		});
		expect(events).toEqual(["persist", "snapshot", "complete", "done"]);
	});

	it("reports an error instead of completing when final transcript persistence fails", async () => {
		const terminalMessages: Array<{ done: boolean; error?: boolean }> = [];
		const persistError = new Error("persistence unavailable");
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const result: StreamResult = {
			toUIMessageStream: async function* () {
				yield { messageId: "assistant-1", type: "start" };
				yield { id: "text-1", type: "text-start" };
				yield { delta: "Answer", id: "text-1", type: "text-delta" };
				yield { id: "text-1", type: "text-end" };
			},
		};
		const broadcastMessages = vi.fn();
		const completeResumableStream = vi.fn();
		const errorResumableStream = vi.fn();
		const fireResponseHook = vi.fn<(input: Record<string, unknown>) => Promise<void>>();
		fireResponseHook.mockResolvedValue();
		const harness: StreamResultHarness = {
			_alignStreamStartId: () => undefined,
			_annotateActionApprovalChunk: (_requestId, chunk) => chunk,
			_applyActionApprovalDescriptorToParts: () => undefined,
			_broadcastChat: (message) => {
				if (message.done) terminalMessages.push(message);
			},
			_broadcastMessages: broadcastMessages,
			_completeResumableStream: completeResumableStream,
			_continuation: { pending: null },
			_drainInferenceStream: () => undefined,
			_errorResumableStream: errorResumableStream,
			_fireResponseHook: fireResponseHook,
			_insideInferenceLoop: false,
			_onStreamingTurnFinalized: () => undefined,
			_pendingResumeConnections: new Set(),
			_persistAssistantMessage: async () => {
				throw persistError;
			},
			_programmaticStreamErrors: new Map(),
			_startResumableStream: () => "stream-1",
			_storeChunkDurably: async () => undefined,
			_streamingAssistant: null,
			_turnQueue: { generation: 1 },
			chatStreamStallTimeoutMs: 30_000,
		};

		await expect(thinkInternals._streamResult.call(harness, "request-1", result)).resolves.toEqual({
			error: persistError.message,
			status: "error",
		});
		expect(broadcastMessages).not.toHaveBeenCalled();
		expect(completeResumableStream).not.toHaveBeenCalled();
		expect(errorResumableStream).toHaveBeenCalledOnce();
		expect(fireResponseHook).toHaveBeenCalledWith(
			expect.objectContaining({ error: persistError.message, status: "error" }),
		);
		expect(terminalMessages).toEqual([
			expect.objectContaining({ body: persistError.message, done: true, error: true }),
		]);
	});
});
