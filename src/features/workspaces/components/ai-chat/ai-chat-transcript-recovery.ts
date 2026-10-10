import type { AiChatMessage } from "#/features/workspaces/components/ai-chat/types";

/** Whether a store snapshot already matches the local transcript exactly. */
export function transcriptsEqual(local: AiChatMessage[], stored: AiChatMessage[]) {
	return JSON.stringify(local) === JSON.stringify(stored);
}

/** Whether a settled store snapshot proves an uncertain transport kept running. */
export function serverTranscriptAdvanced(local: AiChatMessage[], stored: AiChatMessage[]) {
	const localTail = local.at(-1);
	const storedTail = stored.at(-1);

	if (!storedTail || storedTail.role !== "assistant") {
		return false;
	}

	if (!localTail) {
		return true;
	}

	if (localTail.role === "user") {
		const storedUser = stored.find((message) => message.id === localTail.id);
		return (
			storedUser?.role === "user" &&
			JSON.stringify(storedUser.parts) === JSON.stringify(localTail.parts)
		);
	}

	return JSON.stringify(storedTail) !== JSON.stringify(localTail);
}
