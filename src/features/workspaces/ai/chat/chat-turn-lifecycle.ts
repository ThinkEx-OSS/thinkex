import type { UIMessage } from "ai";
import { generateId } from "ai";

import { settledParts } from "#/features/workspaces/ai/chat/chat-model";
import { isStreamClaimFresh } from "#/features/workspaces/ai/chat/chat-claim";

import {
	claimStream,
	pingStreamClaim,
	releaseStream,
	settleStream,
	type AiChatThreadRow,
} from "#/features/workspaces/ai/chat/chat-store";

// The turn lifecycle in one place: claim → ping → settle. The claim column is
// the whole control plane — serialization, liveness, and the stop signal.
//
// - claimTurn takes the per-thread claim (breaking only a provably stale one).
// - The pings refresh the claim's timestamp (so a live long turn is never
//   mistaken for a crashed one) and observe loss: the stop endpoint
//   tombstones the claim, and the generator aborts on its next ping.
// - settle persists the turn's terminal outcome and only THEN releases the
//   claim, and the caller must await it before the stream closes — the
//   composer queue drains the instant the client sees the stream end, and its
//   next turn must find the outcome persisted and the claim free.

// A claim older than this with no pings is presumed orphaned (crashed
// isolate). The interval keeps live claims fresh; chunk callbacks observe stop
// intent promptly while tokens are flowing. A Worker suspended in a provider
// or tool request may not run timers, so stop completion has no clock bound.
const CLAIM_PING_INTERVAL_MS = 30_000;
const CLAIM_PING_THROTTLE_MS = 2_500;

export interface TurnSettleInput {
	assistantMessage: UIMessage | undefined;
	errorMessage: string | undefined;
	isAborted: boolean;
	metadata: Record<string, unknown>;
}

export interface TurnClaim {
	streamId: string;
	/** Aborts when the claim is lost — stop endpoint or stale takeover. */
	signal: AbortSignal;
	/** Throttled ping for high-frequency callsites (per stream chunk). */
	onChunk(): void;
	/** Eager ping for step boundaries. */
	onStepFinish(): void;
	/** Interval backstop for chunkless gaps (tool waits, compaction). */
	startPinging(): void;
	/** Persist the terminal outcome, then release the claim. Idempotent-safe
	 * to follow with releaseOnFailure. */
	settle(input: TurnSettleInput): Promise<void>;
	/** Release without persisting — for failures before the stream started. */
	releaseOnFailure(): void;
}

export async function claimTurn(input: {
	thread: AiChatThreadRow;
	userId: string;
	ctx: ExecutionContext;
}): Promise<TurnClaim | null> {
	const { thread, userId, ctx } = input;
	const threadId = thread.id;
	const streamId = generateId();
	const claimed =
		(await claimStream({ threadId, userId, streamId })) ||
		// Break only the exact stale claim we observed (compare-and-swap on the
		// stream id), so a live generation that claimed after our read survives.
		(isThreadClaimStale(thread) &&
			thread.activeStreamId !== null &&
			(await claimStream({ threadId, userId, streamId, replaceStreamId: thread.activeStreamId })));

	if (!claimed) {
		return null;
	}

	const abortController = new AbortController();
	let pingInFlight = false;
	let lastPingAt = Date.now();
	let pingTimer: ReturnType<typeof setInterval> | undefined;
	const stopPinging = () => clearInterval(pingTimer);

	const ping = async () => {
		if (abortController.signal.aborted || pingInFlight) {
			return;
		}
		pingInFlight = true;
		lastPingAt = Date.now();
		// A transient ping error is not claim loss; only an authoritative
		// "no row matched" means the claim is gone.
		const held = await pingStreamClaim({ threadId, streamId }).catch(() => true);
		pingInFlight = false;
		if (!held) {
			abortController.abort();
		}
	};

	return {
		streamId,
		signal: abortController.signal,
		onChunk: () => {
			if (Date.now() - lastPingAt > CLAIM_PING_THROTTLE_MS) {
				ctx.waitUntil(ping());
			}
		},
		onStepFinish: () => ctx.waitUntil(ping()),
		startPinging: () => {
			pingTimer = setInterval(() => ctx.waitUntil(ping()), CLAIM_PING_INTERVAL_MS);
		},
		settle: async ({ assistantMessage, errorMessage, isAborted, metadata }) => {
			stopPinging();
			const failed = errorMessage !== undefined;
			const clean = !failed && !isAborted;
			const status = failed ? "error" : isAborted ? "interrupted" : "complete";
			const parts = clean
				? (assistantMessage?.parts ?? [])
				: settledParts(assistantMessage?.parts ?? []);
			const message =
				assistantMessage && parts.length > 0
					? {
							...assistantMessage,
							parts,
							metadata: {
								...(typeof assistantMessage.metadata === "object" ? assistantMessage.metadata : {}),
								...metadata,
								...(failed ? { errorMessage } : {}),
							},
						}
					: !clean
						? {
								// Nothing streamed before termination: a stub row keeps the
								// failure or explicit stop visible after reload.
								id: `turn-${status}-${streamId}`,
								role: "assistant" as const,
								parts: [],
								metadata: failed ? { errorMessage } : {},
							}
						: undefined;

			await settleStream({
				threadId,
				streamId,
				message,
				status,
			});
		},
		releaseOnFailure: () => {
			stopPinging();
			ctx.waitUntil(releaseStream({ threadId, streamId }));
		},
	};
}

function isThreadClaimStale(thread: { activeStreamId: string | null; updatedAt: Date }) {
	return thread.activeStreamId !== null && !isStreamClaimFresh(thread);
}
