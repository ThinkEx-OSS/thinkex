import type { UIMessage } from "ai";
import {
	convertToModelMessages,
	createUIMessageStream,
	createUIMessageStreamResponse,
	generateId,
	generateText,
	stepCountIs,
	streamText,
} from "ai";

import type { AIThreadContext } from "#/features/workspaces/ai/ai-thread-metadata";
import { normalizeGeneratedThreadTitle } from "#/features/workspaces/ai/chat/chat-model";
import { getWorkspacePromptScope } from "#/features/workspaces/ai/ai-thread-prompt-scope";
import { getAIThreadSoulPrompt } from "#/features/workspaces/ai/ai-thread-soul-prompt";
import {
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
	claimStream,
	deleteMessagesAfterLastUserMessage,
	ensureThread,
	getThreadAttachment,
	insertCompactionMessage,
	listThreadMessageRows,
	releaseStream,
	saveMessage,
	setThreadTitle,
} from "#/features/workspaces/ai/chat/chat-store";
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
// A claim older than this is presumed orphaned (crashed isolate) and broken.
const STALE_STREAM_CLAIM_MS = 5 * 60 * 1000;

export interface AiChatRequestBody {
	message?: UIMessage;
	modelId?: unknown;
	workspaceId?: string;
	timeZone?: string;
	workspaceAiContext?: unknown;
	trigger?: string;
}

// One chat turn, ai-chatbot-shaped (see AI-CHAT-RUNTIME-EVAL.md §9):
// the client sends only the new user message; prior history comes from
// Postgres, so there is no client/server transcript reconciliation. The user
// message is persisted before generation; the assistant message is persisted
// in the stream's onEnd (or as "interrupted" partial content on abort).
//
// Abort semantics: request.signal feeds streamText, so the client's stop
// aborts generation for real (the composer queue's stop-then-send-now flow
// depends on that). A refresh mid-stream therefore also aborts — the persisted
// partial survives and renders on reload; visible re-attach is the deferred
// resume component's job.
export async function handleAiChatTurn(input: {
	env: Cloudflare.Env;
	ctx: ExecutionContext;
	request: Request;
	threadId: string;
	userId: string;
	body: AiChatRequestBody;
}): Promise<Response> {
	const { env, ctx, threadId, userId, body } = input;
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

	// Membership check (throws WorkspaceForbiddenError for non-members) and the
	// mutation capability that gates write tools this turn.
	const promptScope = await getWorkspacePromptScope({ userId, workspaceId: body.workspaceId });
	const thread = await ensureThread({ threadId, userId, workspaceId: body.workspaceId });

	// A thread id is bound to one workspace for life; a request claiming it for
	// another workspace is confused or malicious either way.
	if (thread.workspaceId !== body.workspaceId) {
		throw new ChatRequestError(409, "Thread belongs to a different workspace");
	}

	const streamId = generateId();
	const claimed =
		(await claimStream({ threadId, userId, streamId })) ||
		// Break only the exact stale claim we observed (compare-and-swap on the
		// stream id), so a live generation that claimed after our read survives.
		(isThreadClaimStale(thread) &&
			thread.activeStreamId !== null &&
			(await claimStream({ threadId, userId, streamId, replaceStreamId: thread.activeStreamId })));

	if (!claimed) {
		throw new ChatRequestError(409, "A response is already being generated");
	}

	const releaseClaim = () => ctx.waitUntil(releaseStream({ threadId, streamId }));

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
			await saveMessage({ threadId, message: userMessage });
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
			getThreadContext: () => Promise.resolve(threadContext),
			canMutate: promptScope.canMutate,
			timeZone: body.timeZone,
		});

		const systemPrompt = buildAiChatSystemPrompt({
			promptScope,
			timeZone: body.timeZone,
		});

		// Compaction: when the estimated request outgrows the model's window,
		// fold everything older than the keep-recent tail into a stored summary
		// (Pi/OpenCode recipe; see chat-compaction.ts). Persist the marker before
		// generating so the next turn starts from summary + tail.
		const context = await prepareCompactedContext({
			rows,
			systemPrompt,
			contextWindow: getWorkspaceAiChatModelById(modelId).contextWindow,
			summarize: async (prompt) => {
				const result = await generateText({
					model: getWorkspaceAiLanguageModel(AI_CHAT_COMPACTION_MODEL_ID, env, threadId),
					providerOptions: getWorkspaceAiGatewayProviderOptions({
						modelId: AI_CHAT_COMPACTION_MODEL_ID,
						tags: ["task:chat-compaction"],
					}),
					prompt,
					maxOutputTokens: COMPACTION_SUMMARY_MAX_OUTPUT_TOKENS,
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
		const workspaceContext = formatWorkspaceAiContextForPrompt(body.workspaceAiContext);

		if (workspaceContext) {
			context.messages.at(-1)?.parts.push({ type: "text", text: workspaceContext });
		}

		// Resolved by execute; read in onEnd so usage lands on the persisted row.
		let totalUsagePromise: PromiseLike<unknown> | undefined;

		const stream = createUIMessageStream({
			generateId,
			execute: async ({ writer }) => {
				const modelMessages = await convertToModelMessages(
					await hydrateAttachmentParts(context.messages, { userId }),
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
					abortSignal: input.request.signal,
				});

				totalUsagePromise = result.totalUsage;
				writer.merge(result.toUIMessageStream({ sendReasoning: false }));
			},
			onError: (error) => {
				// Turn outcomes are durable (Pi's stopReason / OpenCode's finish): a
				// failed turn persists a stub assistant row so the error survives
				// reload instead of being inferred from a dangling user message.
				ctx.waitUntil(
					saveMessage({
						threadId,
						message: {
							id: `turn-error-${streamId}`,
							role: "assistant",
							parts: [],
							metadata: { errorMessage: "The assistant hit an error while responding." },
						},
						status: "error",
					}),
				);
				releaseClaim();
				console.error("[ai-chat] turn failed:", error);
				return "The assistant hit an error while responding. Please try again.";
			},
			onEnd: ({ messages, isAborted }) => {
				const assistantMessage = [...messages]
					.reverse()
					.find((message) => message.role === "assistant");

				if (assistantMessage && assistantMessage.parts.length > 0) {
					ctx.waitUntil(
						// Usage + model ride the row's metadata (both references persist
						// them; usage also anchors future usage-based compaction
						// estimates). Aborted turns may never resolve usage — persist
						// without it rather than hanging on the promise.
						(async () => {
							const usage = isAborted
								? undefined
								: await Promise.resolve(totalUsagePromise).catch(() => undefined);

							await saveMessage({
								threadId,
								// Tool calls without a terminal result (aborted mid-tool) are
								// stripped before persisting; a dangling tool_use otherwise
								// poisons every future model request in this thread.
								message: {
									...assistantMessage,
									parts: isAborted ? settledParts(assistantMessage.parts) : assistantMessage.parts,
									metadata: {
										...(typeof assistantMessage.metadata === "object"
											? assistantMessage.metadata
											: {}),
										modelId,
										...(usage ? { usage } : {}),
									},
								},
								status: isAborted ? "interrupted" : "complete",
							});
						})(),
					);
					ctx.waitUntil(
						trackWorkspaceAiMessageUsage({
							env,
							modelId,
							threadId,
							userId,
							workspaceId: threadContext.workspaceId,
						}),
					);

					if (isFirstExchange && userMessage) {
						ctx.waitUntil(
							generateAIThreadTitle({ env, messages: [userMessage] })
								.then((title) => {
									const normalized = normalizeGeneratedThreadTitle(title);

									return normalized ? setThreadTitle({ threadId, title: normalized }) : undefined;
								})
								.catch((error) => console.error("[ai-chat] title generation failed:", error)),
						);
					}
				}

				releaseClaim();
			},
		});

		// consumeSseStream drains a tee'd copy of the stream server-side, so the
		// pipeline — including onEnd's persistence and claim release — runs to
		// completion even when the client cancels its branch (stop, refresh,
		// tab close). Generation itself still aborts via request.signal above;
		// this only guarantees the abort is *observed* and settled.
		return createUIMessageStreamResponse({
			stream,
			consumeSseStream: ({ stream: sseStream }) => {
				ctx.waitUntil(sseStream.pipeTo(new WritableStream()).catch(() => {}));
			},
		});
	} catch (error) {
		releaseClaim();
		throw error;
	}
}

const MAX_MESSAGE_PARTS = 40;
const MAX_TEXT_PART_CHARS = 32_000;

// Minimal shape/size caps on the client-supplied message before anything is
// persisted — parts land in jsonb verbatim, so unbounded input is unbounded
// storage. Attachment count/size limits are enforced at upload time; this
// bounds the message envelope itself.
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
		if (part.type === "text" && part.text.length > MAX_TEXT_PART_CHARS) {
			return "Message text is too long";
		}
	}

	return null;
}

// Keep only parts that reached a terminal state — used when persisting an
// aborted turn, where tool parts can be frozen at input-streaming/available.
function settledParts(parts: UIMessage["parts"]): UIMessage["parts"] {
	return parts.filter((part) => {
		if ("state" in part && typeof part.state === "string") {
			return part.state.startsWith("output-") || part.state === "done";
		}

		return true;
	});
}

function isThreadClaimStale(thread: { activeStreamId: string | null; updatedAt: Date }) {
	return (
		thread.activeStreamId !== null &&
		Date.now() - thread.updatedAt.getTime() > STALE_STREAM_CLAIM_MS
	);
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
// Two hard rules: (1) only our own attachment URLs hydrate — any other file
// URL (external link, data URL smuggled past the composer) is replaced with a
// placeholder so nothing unvetted reaches the gateway; (2) hydration spends a
// fixed byte budget newest-first, and older images degrade to placeholders,
// bounding per-turn memory however long the thread gets.
async function hydrateAttachmentParts(
	messages: UIMessage[],
	scope: { userId: string },
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

			if (!identity || remainingBudget <= 0) {
				parts.push(omittedPart);
				continue;
			}

			const attachment = await getThreadAttachment({
				attachmentId: identity.attachmentId,
				threadId: identity.threadId,
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
