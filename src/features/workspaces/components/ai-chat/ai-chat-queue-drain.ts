import type { AiChatStatus } from "#/features/workspaces/components/ai-chat/types";

/**
 * Whether the head of the message queue may be auto-sent right now. The queue
 * only drains into a healthy, idle chat: errors and the usage gate make it
 * wait rather than burn queued messages, and a paused queue (the user pressed
 * Stop) never drains on its own.
 */
export function canDrainQueuedMessage(input: {
	hasHead: boolean;
	paused: boolean;
	canSend: boolean;
	inputStatus: AiChatStatus;
	isBlocked: boolean;
	hasConnectionError: boolean;
	hasAssistantError: boolean;
}): boolean {
	return (
		input.hasHead &&
		!input.paused &&
		!input.isBlocked &&
		!input.hasConnectionError &&
		!input.hasAssistantError &&
		input.canSend &&
		input.inputStatus === "ready"
	);
}
