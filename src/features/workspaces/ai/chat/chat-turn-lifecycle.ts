import type { UIMessage } from "ai";
import { generateId } from "ai";

import { settledParts } from "#/features/workspaces/ai/chat/chat-model";

import {
	claimStream,
	pingStreamClaim,
	releaseStream,
	saveMessage,
	type AiChatThreadRow,
} from "#/features/workspaces/ai/chat/chat-store";

// The turn lifecycle in one place: claim → ping → settle. The claim column is
// the whole control plane — serialization, liveness, and the stop signal.
//
// - claimTurn takes the per-thread claim (breaking only a provably stale one).
// - The pings refresh the claim's timestamp (so a live long turn is never
//   mistaken for a crashed one) and observe loss: the stop endpoint clears the
//   claim, and the generator aborts on its next ping.
// - settle persists the turn's terminal outcome and only THEN releases the
//   claim, and the caller must await it before the stream closes — the
//   composer queue drains the instant the client sees the stream end, and its
//   next turn must find the outcome persisted and the claim free.

// A claim older than this with no pings is presumed orphaned (crashed
// isolate). Live turns ping every ~2.5s streaming and every 30s idle, so a
// stale claim really is dead.
const STALE_STREAM_CLAIM_MS = 5 * 60 * 1000;
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
			try {
				const failed = errorMessage !== undefined;
				const clean = !failed && !isAborted;
				const parts = clean
					? (assistantMessage?.parts ?? [])
					: settledParts(assistantMessage?.parts ?? []);

				if (assistantMessage && parts.length > 0) {
					await saveMessage({
						threadId,
						message: {
							...assistantMessage,
							parts,
							metadata: {
								...(typeof assistantMessage.metadata === "object" ? assistantMessage.metadata : {}),
								...metadata,
								...(failed ? { errorMessage } : {}),
							},
						},
						status: failed ? "error" : isAborted ? "interrupted" : "complete",
					});
				} else if (failed) {
					// Nothing streamed before the error: a stub row keeps the failure
					// visible after reload (Pi's durable stopReason).
					await saveMessage({
						threadId,
						message: {
							id: `turn-error-${streamId}`,
							role: "assistant",
							parts: [],
							metadata: { errorMessage },
						},
						status: "error",
					});
				}
			} finally {
				await releaseStream({ threadId, streamId });
			}
		},
		releaseOnFailure: () => {
			stopPinging();
			ctx.waitUntil(releaseStream({ threadId, streamId }));
		},
	};
}

function isThreadClaimStale(thread: { activeStreamId: string | null; updatedAt: Date }) {
	return (
		thread.activeStreamId !== null &&
		Date.now() - thread.updatedAt.getTime() > STALE_STREAM_CLAIM_MS
	);
}
