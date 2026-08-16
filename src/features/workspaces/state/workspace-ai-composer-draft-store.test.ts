import { describe, expect, it } from "vitest";

import { WORKSPACE_AI_CHAT_ATTACHMENT_POLICY } from "#/features/workspaces/components/ai-chat/constants";
import { useWorkspaceAiComposerDraftStore } from "#/features/workspaces/state/workspace-ai-composer-draft-store";

describe("workspace AI composer drafts", () => {
	it("stages already-uploaded parts as ready files without duplicating them", () => {
		const threadId = crypto.randomUUID();
		const store = useWorkspaceAiComposerDraftStore.getState();
		const part = {
			filename: "diagram.png",
			mediaType: "image/png",
			type: "file" as const,
			url: "https://r2.example/diagram.png",
		};

		expect(store.addReadyFiles(threadId, [part])).toBe(true);
		expect(store.addReadyFiles(threadId, [part])).toBe(true);

		const files = useWorkspaceAiComposerDraftStore.getState().filesByThreadId[threadId];
		expect(files).toHaveLength(1);
		expect(files?.[0]).toMatchObject({ status: "ready", url: part.url });
	});

	it("refuses an entire ready-file transfer that would exceed the chat limit", () => {
		const threadId = crypto.randomUUID();
		const store = useWorkspaceAiComposerDraftStore.getState();
		const parts = Array.from(
			{ length: WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.maxFiles },
			(_, index) => ({
				filename: `existing-${index}.png`,
				mediaType: "image/png",
				type: "file" as const,
				url: `https://r2.example/existing-${index}.png`,
			}),
		);
		store.addReadyFiles(threadId, parts);

		const accepted = store.addReadyFiles(threadId, [
			{
				filename: "queued.png",
				mediaType: "image/png",
				type: "file",
				url: "https://r2.example/queued.png",
			},
		]);

		expect(accepted).toBe(false);
		expect(useWorkspaceAiComposerDraftStore.getState().filesByThreadId[threadId]).toHaveLength(
			WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.maxFiles,
		);
	});
});
