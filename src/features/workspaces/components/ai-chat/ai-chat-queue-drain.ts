/**
 * Whether the head of the message queue may be auto-sent right now. The queue
 * waits on real failures and explicit pauses, but an interrupted run may hand
 * off directly to a message the user promoted from the queue.
 */
export function canDrainQueuedMessage(input: {
	canSend: boolean;
	errorKind: "aborted" | "assistant" | "connection" | undefined;
	isBlocked: boolean;
	paused: boolean;
}): boolean {
	return (
		!input.paused &&
		!input.isBlocked &&
		input.errorKind !== "assistant" &&
		input.errorKind !== "connection" &&
		input.canSend
	);
}
