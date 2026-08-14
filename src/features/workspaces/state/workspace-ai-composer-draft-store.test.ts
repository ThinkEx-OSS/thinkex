import { describe, expect, it } from "vitest";

import { useWorkspaceAiComposerDraftStore } from "#/features/workspaces/state/workspace-ai-composer-draft-store";

describe("workspace AI direct prompts", () => {
	it("sends one action prompt without replacing the user's draft", () => {
		const threadId = crypto.randomUUID();
		const store = useWorkspaceAiComposerDraftStore.getState();
		store.setText(threadId, "My unfinished question");

		expect(store.queueDirectPrompt(threadId, "Create flashcards")).toBe(true);
		expect(store.queueDirectPrompt(threadId, "Create something else")).toBe(false);
		const prompt = useWorkspaceAiComposerDraftStore.getState().directPromptByThreadId[threadId];
		expect(prompt).toBeDefined();
		expect(store.takeDirectPrompt(threadId, "wrong-id")).toBeNull();
		expect(store.takeDirectPrompt(threadId, prompt!.id)).toBe("Create flashcards");
		expect(useWorkspaceAiComposerDraftStore.getState().textByThreadId[threadId]).toBe(
			"My unfinished question",
		);
	});
});
