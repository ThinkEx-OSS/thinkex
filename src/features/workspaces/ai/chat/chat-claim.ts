/** Maximum time without a durable claim refresh before takeover is allowed. */
export const AI_CHAT_STREAM_CLAIM_STALE_MS = 5 * 60 * 1000;

/** Whether a thread claim is both present and recent enough to block a new turn. */
export function isStreamClaimFresh(
	thread: { activeStreamId: string | null; updatedAt: Date },
	now = Date.now(),
) {
	return (
		thread.activeStreamId !== null &&
		now - thread.updatedAt.getTime() <= AI_CHAT_STREAM_CLAIM_STALE_MS
	);
}
