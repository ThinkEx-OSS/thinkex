import type { UIMessage } from "ai";
import {
	convertToModelMessages,
	createUIMessageStream,
	createUIMessageStreamResponse,
	generateId,
	generateText,
	stepCountIs,
	streamText,
	validateUIMessages,
} from "ai";

import type { AIThreadContext } from "#/features/workspaces/ai/ai-thread-metadata";
import { normalizeGeneratedThreadTitle } from "#/features/workspaces/ai/chat/chat-model";
import { requireThreadAccess } from "#/features/workspaces/ai/chat/chat-access";
import { getAIThreadSoulPrompt } from "#/features/workspaces/ai/ai-thread-soul-prompt";
import {
	AI_THREAD_TITLE_GATEWAY_MODEL,
	generateAIThreadTitle,
	getWorkspaceAiGatewayProviderOptions,
	getWorkspaceAiLanguageModel,
} from "#/features/workspaces/ai/gateway";
import {
	getWorkspaceAiChatModelById,
	resolveWorkspaceAiChatModelId,
} from "#/features/workspaces/ai/models";
import {
	COMPACTION_SUMMARY_MAX_OUTPUT_TOKENS,
	prepareCompactedContext,
} from "#/features/workspaces/ai/chat/chat-compaction";
import { ChatRequestError } from "#/features/workspaces/ai/chat/chat-errors";
import { WORKSPACE_AI_CHAT_ATTACHMENT_POLICY } from "#/features/workspaces/ai/chat-attachment-policy";
import { parseChatAttachmentContentUrl } from "#/features/workspaces/ai/chat-attachment-storage";
import {
	deleteMessagesAfterLastUserMessage,
	deleteMessagesAfterUserMessage,
	getThreadAttachment,
	insertCompactionMessage,
	listThreadMessageRows,
	saveMessage,
	setThreadTitle,
} from "#/features/workspaces/ai/chat/chat-store";
import {
	captureAiChatGeneration,
	toolNamesFromParts,
} from "#/features/workspaces/ai/chat/chat-telemetry";
import { claimTurn } from "#/features/workspaces/ai/chat/chat-turn-lifecycle";
import { createAiChatTools } from "#/features/workspaces/ai/chat/chat-tools";
import { formatWorkspaceAiContextForPrompt } from "#/features/workspaces/model/workspace-ai-context-prompt";
import {
	checkWorkspaceAiMessageAccess,
	trackWorkspaceAiMessageUsage,
} from "#/integrations/autumn/workspace-ai-usage";

const MAX_AGENT_STEPS = 16;
// Summaries need capable long-context reading but not the session's model.
// LOAD-BEARING, not just economical: the head being summarized can approach
// the CHAT model's whole window (verified: a ~196k-token head compacts fine
// for a 200k-window Haiku session precisely because Flash's 1M window reads
// it). Do not "simplify" this to the session model — summarization would
// overflow on exactly the turns compaction exists to save.
const AI_CHAT_COMPACTION_MODEL_ID = "gemini" as const;

export interface AiChatRequestBody {
	message?: UIMessage;
	modelId?: unknown;
	workspaceId?: string;
	timeZone?: string;
	workspaceAiContext?: unknown;
	trigger?: string;
}

// One chat turn, ai-chatbot-shaped: the client sends only the new user
// message; prior history comes from Postgres, so there is no client/server
// transcript reconciliation. The user message is persisted before generation;
// the assistant message is persisted once, in the stream's onEnd.
//
// Stop/disconnect semantics — the claim column is the whole control plane:
// - Disconnect (refresh, tab close) does NOT abort: consumeSseStream keeps
//   the pipeline settling server-side and the finished reply is there on
//   reload. (Workers never fire request.signal without enable_request_signal
//   anyway; we lean on that instead of fighting it.)
// - Stop is explicit: POST /threads/:id/stop clears the claim. The generator
//   pings its claim on every step and on an interval; losing it aborts
//   generation and the partial persists as "interrupted".
// - The same ping is the liveness heartbeat, so a live long turn is never
//   mistaken for a crashed one, and a stolen turn stops writing.
export async function handleAiChatTurn(input: {
	env: Cloudflare.Env;
	ctx: ExecutionContext;
	threadId: string;
	userId: string;
	body: AiChatRequestBody;
	/** Resolved from the request's consent cookie; gates telemetry content. */
	analyticsConsent: boolean;
}): Promise<Response> {
	const { env, ctx, threadId, userId, body, analyticsConsent } = input;
	const isRegenerate = body.trigger === "regenerate-message";

	if (!body.workspaceId) {
		throw new ChatRequestError(400, "workspaceId is required");
	}

	if (!isRegenerate && (!body.message || body.message.role !== "user")) {
		throw new ChatRequestError(400, "A user message is required");
	}

	const invalidMessage = userMessageValidationError(body);

	if (invalidMessage) {
		throw new ChatRequestError(400, invalidMessage);
	}

	if (body.message) {
		// Structural validation via the SDK — part shapes the size caps can't see.
		await validateUIMessages({ messages: [body.message] }).catch(() => {
			throw new ChatRequestError(400, "Message is malformed");
		});
	}

	// Ownership + workspace binding + current membership in one gate; also
	// materializes the draft row and yields the mutation capability that gates
	// write tools this turn.
	const { promptScope, thread } = await requireThreadAccess({
		threadId,
		userId,
		workspaceId: body.workspaceId,
		mode: "create-draft",
	});

	const turn = await claimTurn({ thread, userId, ctx });

	if (!turn) {
		throw new ChatRequestError(409, "A response is already being generated");
	}

	try {
		// Autumn usage gate first: nothing destructive (regenerate's delete, the
		// user-message insert) may happen on a turn that gets blocked.
		const access = await checkWorkspaceAiMessageAccess({
			env,
			modelId: resolveWorkspaceAiChatModelId(body.modelId),
			userId,
		});

		if (!access.allowed) {
			throw new ChatRequestError(
				429,
				access.resetsAt
					? `Usage limit reached. Resets ${new Date(access.resetsAt).toISOString().slice(0, 10)}.`
					: "Usage limit reached.",
			);
		}

		if (isRegenerate) {
			await deleteMessagesAfterLastUserMessage({ threadId, userId });
		}

		const userMessage = isRegenerate ? undefined : body.message;

		if (!isRegenerate && userMessage) {
			// A resend of an already-persisted id truncates everything after it and
			// re-runs (retry after an error turn, edit-and-resend). No-op for new ids.
			await deleteMessagesAfterUserMessage({ threadId, userId, messageId: userMessage.id });
			const wrote = await saveMessage({ threadId, message: userMessage });

			if (!wrote) {
				// The id collides with an existing row of a different role; the
				// role-guarded upsert refused the overwrite.
				throw new ChatRequestError(400, "Message id conflicts with an existing reply");
			}
		}

		// One read of everything (with seqs and compaction markers): the chat
		// history for checks/titles and the model-context input both come from it.
		const rows = await listThreadMessageRows({ threadId, userId });
		const chatMessages = rows
			.filter((row) => row.compaction === null && row.message.role !== "system")
			.map((row) => row.message);
		const isFirstExchange = chatMessages.length === 1 && userMessage !== undefined;

		if (chatMessages.at(-1)?.role !== "user") {
			throw new ChatRequestError(400, "Nothing to respond to");
		}

		const modelId = access.modelId;
		const threadContext: AIThreadContext = {
			id: threadId,
			workspaceId: body.workspaceId,
			promptScope,
			userId,
		};
		const tools = createAiChatTools({
			env,
			threadContext,
			canMutate: promptScope.canMutate,
			timeZone: body.timeZone,
		});

		const systemPrompt = buildAiChatSystemPrompt({
			promptScope,
			timeZone: body.timeZone,
		});
		// Computed before compaction so its size counts toward the window
		// estimate — appended after, it would be invisible to the budget and
		// could push an "it fits" turn over the provider limit.
		const workspaceContext = formatWorkspaceAiContextForPrompt(body.workspaceAiContext);

		// Compaction: when the estimated request outgrows the model's window,
		// fold everything older than the keep-recent tail into a stored summary
		// (Pi/OpenCode recipe; see chat-compaction.ts). Persist the marker before
		// generating so the next turn starts from summary + tail.
		const context = await prepareCompactedContext({
			rows,
			systemPrompt: systemPrompt + workspaceContext,
			contextWindow: getWorkspaceAiChatModelById(modelId).contextWindow,
			summarize: async (prompt) => {
				const telemetryBase = {
					userId,
					workspaceId: threadContext.workspaceId,
					threadId,
					traceId: turn.streamId,
					gatewayModel: getWorkspaceAiChatModelById(AI_CHAT_COMPACTION_MODEL_ID).gatewayModel,
					task: "chat-compaction" as const,
					startedAt: Date.now(),
					includeContent: analyticsConsent,
					input: [{ role: "user", content: prompt }],
				};

				let result;

				try {
					result = await generateText({
						model: getWorkspaceAiLanguageModel(AI_CHAT_COMPACTION_MODEL_ID, env, threadId),
						providerOptions: getWorkspaceAiGatewayProviderOptions({
							modelId: AI_CHAT_COMPACTION_MODEL_ID,
							tags: ["task:chat-compaction"],
						}),
						prompt,
						maxOutputTokens: COMPACTION_SUMMARY_MAX_OUTPUT_TOKENS,
					});
				} catch (error) {
					// Compaction fails open upstream, so this event is the only record
					// the summarizer call happened — without it a failing summarizer
					// model is invisible in the analytics.
					captureAiChatGeneration({
						...telemetryBase,
						outcome: "error",
						errorMessage: error instanceof Error ? error.message : String(error),
					});
					throw error;
				}

				captureAiChatGeneration({
					...telemetryBase,
					usage: result.totalUsage,
					providerMetadata: await Promise.resolve(result.providerMetadata).catch(() => undefined),
					outcome: "complete",
					output: [{ role: "assistant", content: result.text }],
				});

				return result.text;
			},
		});

		if (context.newCompaction) {
			await insertCompactionMessage({ threadId, ...context.newCompaction });
		}

		// The turn's workspace context rides the end of the last message (which is
		// always the user's), not the system prompt: everything ahead of it is a
		// cacheable prefix, and per-turn content there would invalidate it. Never
		// persisted — these rows are discarded when the turn ends.
		if (workspaceContext) {
			context.messages.at(-1)?.parts.push({ type: "text", text: workspaceContext });
		}

		// Resolved by execute; read in onEnd so usage lands on the persisted row.
		let totalUsagePromise: PromiseLike<unknown> | undefined;
		let providerMetadataPromise: PromiseLike<unknown> | undefined;
		// Set by onError; consumed by onEnd, which is the single writer for the
		// turn's outcome (both callbacks fire on a failed stream — treating them
		// as exclusive double-persisted the reply).
		let turnErrorMessage: string | undefined;
		const turnStartedAt = Date.now();
		let firstTokenAt: number | undefined;

		const stream = createUIMessageStream({
			generateId,
			execute: async ({ writer }) => {
				// Started inside execute so a pre-stream throw never leaks the timer.
				turn.startPinging();

				if (isFirstExchange && userMessage) {
					// Title generation runs concurrently with the reply and is DELIVERED
					// through the stream as a data part (ai-chatbot's pattern) — the
					// client refetches the sidebar the moment it arrives, replacing the
					// old poll-and-hope timers. Persistence is the same promise; the
					// stream write is best-effort (an ultra-short reply may close the
					// stream first, in which case the next refetch picks the title up).
					const titleTelemetryBase = {
						userId,
						workspaceId: threadContext.workspaceId,
						threadId,
						traceId: turn.streamId,
						task: "chat-title" as const,
						startedAt: Date.now(),
						includeContent: analyticsConsent,
						input: [{ role: "user", content: userMessage.parts }],
					};
					ctx.waitUntil(
						(async () => {
							let generated;

							try {
								generated = await generateAIThreadTitle({ env, messages: [userMessage] });
							} catch (error) {
								// The model call failing must still produce an event — a dead
								// title model would otherwise be invisible in the analytics.
								captureAiChatGeneration({
									...titleTelemetryBase,
									gatewayModel: AI_THREAD_TITLE_GATEWAY_MODEL,
									outcome: "error",
									errorMessage: error instanceof Error ? error.message : String(error),
								});
								console.error("[ai-chat] title generation failed:", error);
								return;
							}

							if (!generated) {
								return;
							}
							captureAiChatGeneration({
								...titleTelemetryBase,
								gatewayModel: generated.gatewayModel,
								usage: generated.usage,
								providerMetadata: generated.providerMetadata,
								outcome: "complete",
								...(generated.title
									? { output: [{ role: "assistant", content: generated.title }] }
									: {}),
							});
							const normalized = normalizeGeneratedThreadTitle(generated.title);
							if (!normalized) {
								return;
							}
							try {
								writer.write({ type: "data-thread-title", data: normalized, transient: true });
							} catch {
								// Stream already closed — persistence below still lands.
							}
							await setThreadTitle({ threadId, title: normalized });
						})().catch((error) => console.error("[ai-chat] title delivery failed:", error)),
					);
				}

				const modelMessages = await convertToModelMessages(
					await hydrateAttachmentParts(context.messages, { userId, threadId }),
					// An interrupted earlier turn may have persisted a tool call whose
					// result never arrived; replaying it verbatim 400s at the provider
					// and would brick the thread. Dropping it is always safe.
					{ ignoreIncompleteToolCalls: true },
				);
				const result = streamText({
					model: getWorkspaceAiLanguageModel(modelId, env, threadId),
					providerOptions: getWorkspaceAiGatewayProviderOptions({
						modelId,
						thread: threadContext,
						tags: ["impl:postgres"],
					}),
					instructions: systemPrompt,
					messages: modelMessages,
					tools,
					stopWhen: stepCountIs(MAX_AGENT_STEPS),
					abortSignal: turn.signal,
					onChunk: () => {
						firstTokenAt ??= Date.now();
						turn.onChunk();
					},
					onStepFinish: () => turn.onStepFinish(),
				});

				totalUsagePromise = result.totalUsage;
				providerMetadataPromise = result.providerMetadata;
				writer.merge(result.toUIMessageStream({ sendReasoning: false }));
			},
			onError: (error) => {
				// Record only. onEnd still fires after a failed stream and is the
				// single writer for the outcome — persisting here too double-wrote
				// the reply (error stub + partial-as-complete).
				turnErrorMessage = "The assistant hit an error while responding.";
				console.error("[ai-chat] turn failed:", error);
				return "The assistant hit an error while responding. Please try again.";
			},
			onEnd: async ({ messages, isAborted }) => {
				const assistantMessage = [...messages]
					.reverse()
					.find((message) => message.role === "assistant");
				const clean = turnErrorMessage === undefined && !isAborted;
				// Usage + model ride the row's metadata. Aborted turns may never
				// resolve usage — persist without it rather than hang.
				const usage = clean
					? await Promise.resolve(totalUsagePromise).catch(() => undefined)
					: undefined;

				// AWAITED, deliberately: the stream must not close before the outcome
				// is persisted and the claim released — the composer queue drains the
				// instant the client sees the stream end, and its next turn must find
				// both. waitUntil doubles as a keep-alive in case the platform stops
				// awaiting onEnd.
				const settled = turn.settle({
					assistantMessage,
					errorMessage: turnErrorMessage,
					isAborted,
					metadata: { modelId, ...(usage ? { usage } : {}) },
				});
				ctx.waitUntil(settled);
				// Bounded: a hung settle must not pin the client in "streaming"
				// forever — waitUntil above still carries the real write to completion.
				await Promise.race([settled, new Promise((resolve) => setTimeout(resolve, 5_000))]);

				captureAiChatGeneration({
					userId,
					workspaceId: threadContext.workspaceId,
					threadId,
					traceId: turn.streamId,
					gatewayModel: getWorkspaceAiChatModelById(modelId).gatewayModel,
					requestedModel: modelId,
					task: "chat-turn",
					startedAt: turnStartedAt,
					firstTokenAt,
					usage,
					providerMetadata: clean
						? await Promise.resolve(providerMetadataPromise).catch(() => undefined)
						: undefined,
					outcome:
						turnErrorMessage !== undefined ? "error" : isAborted ? "interrupted" : "complete",
					errorMessage: turnErrorMessage,
					toolNames: assistantMessage ? toolNamesFromParts(assistantMessage.parts) : undefined,
					includeContent: analyticsConsent,
					// Pre-hydration parts: attachment URLs, never inlined image bytes.
					input: context.messages.map((message) => ({
						role: message.role,
						content: message.parts,
					})),
					...(assistantMessage
						? { output: [{ role: "assistant", content: assistantMessage.parts }] }
						: {}),
				});

				if (clean && assistantMessage) {
					ctx.waitUntil(
						trackWorkspaceAiMessageUsage({
							env,
							modelId,
							threadId,
							userId,
							workspaceId: threadContext.workspaceId,
						}),
					);
				}
			},
		});

		// consumeSseStream drains a tee'd copy of the stream server-side, so the
		// pipeline — including onEnd's awaited settlement — runs to completion
		// even when the client cancels its branch (refresh, tab close).
		return createUIMessageStreamResponse({
			stream,
			consumeSseStream: ({ stream: sseStream }) => {
				ctx.waitUntil(sseStream.pipeTo(new WritableStream()).catch(() => {}));
			},
		});
	} catch (error) {
		turn.releaseOnFailure();
		throw error;
	}
}

const MAX_MESSAGE_PARTS = 40;
const MAX_TEXT_PART_CHARS = 32_000;
// The envelope cap that actually binds: parts and metadata land in jsonb
// verbatim, and per-field checks can't enumerate every shape the UIMessage
// type allows. Roomy enough for max text parts plus attachment URLs.
const MAX_MESSAGE_SERIALIZED_BYTES = 1_500_000;
const USER_MESSAGE_PART_TYPES = new Set(["text", "file"]);

// Shape/size caps on the client-supplied message before anything is
// persisted. Attachment count/size limits are enforced at upload time; this
// bounds the message envelope itself. Structural validity (part shapes) is
// checked separately via the SDK's validateUIMessages.
function userMessageValidationError(body: AiChatRequestBody): string | null {
	const message = body.message;

	if (!message) {
		return null;
	}

	if (!Array.isArray(message.parts) || message.parts.length > MAX_MESSAGE_PARTS) {
		return "Message has too many parts";
	}

	if (typeof message.id !== "string" || message.id.length === 0 || message.id.length > 128) {
		return "Message id is invalid";
	}

	for (const part of message.parts) {
		if (typeof part !== "object" || part === null || !USER_MESSAGE_PART_TYPES.has(part.type)) {
			return "Message contains an unsupported part type";
		}

		if (part.type === "text" && part.text.length > MAX_TEXT_PART_CHARS) {
			return "Message text is too long";
		}
	}

	if (JSON.stringify(message).length > MAX_MESSAGE_SERIALIZED_BYTES) {
		return "Message is too large";
	}

	return null;
}

// Exported for the eval harness, which must grade models against the exact
// prompt production ships.
//
// Everything here must stay byte-identical across the turns of a conversation:
// providers cache on a prefix match, and the system block sits ahead of the
// entire message history, so one changing character re-bills every prior turn
// at full price. Two rules follow, both borrowed from OpenCode
// (session/system.ts, session/reminders.ts):
//   - the date is day-granular, never clock time — a minute-granular timestamp
//     changes the prefix every 60 seconds, which is a guaranteed cache miss on
//     every turn. Exact time comes from the time tools instead.
//   - per-turn context (what the user is looking at) is NOT here; it rides the
//     tail of the latest user message, after the cached prefix.
export function buildAiChatSystemPrompt(input: {
	promptScope: { canMutate: boolean; workspaceName: string };
	timeZone: string | undefined;
}) {
	const scopeLines = [
		"# Current Turn",
		`- Workspace: ${input.promptScope.workspaceName}`,
		input.promptScope.canMutate
			? null
			: "- Workspace access: view-only. Do not create, rename, edit, move, or delete workspace items.",
		`- Date: ${formatPromptDate(new Date(), input.timeZone)}`,
		"- Actual workspace paths are absolute, such as /.",
	].filter((line): line is string => Boolean(line));

	return [getAIThreadSoulPrompt(), scopeLines.join("\n")].join("\n\n");
}

// Attachment file parts carry authed app URLs the provider can't fetch, so
// model input inlines the bytes as data URLs read straight from Postgres.
// (Successor of the Think patch's modelMessageUrlBase URL-absolutization —
// with bytes in the database, no URL ever reaches a provider.)
//
// Three hard rules: (1) only our own attachment URLs hydrate — any other file
// URL (external link, data URL smuggled past the composer) is replaced with a
// placeholder so nothing unvetted reaches the gateway; (2) only THIS thread's
// attachments hydrate — the URL's thread id is an untrusted claim, and a
// crafted part must not pull another thread's bytes into this workspace's
// model request; (3) hydration spends a fixed byte budget newest-first, and
// older images degrade to placeholders, bounding per-turn memory however long
// the thread gets.
async function hydrateAttachmentParts(
	messages: UIMessage[],
	scope: { userId: string; threadId: string },
): Promise<UIMessage[]> {
	let remainingBudget = WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.maxModelAttachmentBytes;
	const omittedPart = { type: "text" as const, text: "(image omitted)" };

	// Sequential, newest message first, so the budget is deterministic.
	const hydrated: UIMessage[] = [];

	for (const message of [...messages].reverse()) {
		const parts: UIMessage["parts"] = [];

		for (const part of message.parts) {
			if (part.type !== "file" || typeof part.url !== "string") {
				parts.push(part);
				continue;
			}

			const identity = parseChatAttachmentContentUrl(part.url);

			if (!identity || identity.threadId !== scope.threadId || remainingBudget <= 0) {
				parts.push(omittedPart);
				continue;
			}

			const attachment = await getThreadAttachment({
				attachmentId: identity.attachmentId,
				threadId: scope.threadId,
				userId: scope.userId,
			});

			if (!attachment || attachment.bytes.byteLength > remainingBudget) {
				parts.push(omittedPart);
				continue;
			}

			remainingBudget -= attachment.bytes.byteLength;
			parts.push({
				...part,
				url: `data:${attachment.mediaType};base64,${encodeBytesBase64(attachment.bytes)}`,
			});
		}

		hydrated.push({ ...message, parts });
	}

	return hydrated.reverse();
}

function encodeBytesBase64(bytes: Uint8Array) {
	let binary = "";
	const chunkSize = 0x8000;

	for (let index = 0; index < bytes.length; index += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
	}

	return btoa(binary);
}

function formatPromptDate(date: Date, timeZone: string | undefined) {
	const resolvedTimeZone = getSafeTimeZone(timeZone);

	return `${new Intl.DateTimeFormat("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		timeZone: resolvedTimeZone,
	}).format(date)} (${resolvedTimeZone})`;
}

function getSafeTimeZone(value: string | undefined) {
	if (!value?.trim()) {
		return "UTC";
	}

	try {
		new Intl.DateTimeFormat("en-US", { timeZone: value });
		return value;
	} catch {
		return "UTC";
	}
}
