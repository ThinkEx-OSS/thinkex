import { Think } from "@cloudflare/think";
import type { DynamicToolUIPart, UIMessage } from "ai";
import { describe, expect, it, vi } from "vitest";

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
}

const thinkInternals = Think.prototype as unknown as ThinkRegressionInternals;

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
});
