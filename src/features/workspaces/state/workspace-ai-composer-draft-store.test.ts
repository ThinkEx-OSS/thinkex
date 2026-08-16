import { describe, expect, it } from "vitest";

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

		store.addReadyFiles(threadId, [part]);
		store.addReadyFiles(threadId, [part]);

		const files = useWorkspaceAiComposerDraftStore.getState().filesByThreadId[threadId];
		expect(files).toHaveLength(1);
		expect(files?.[0]).toMatchObject({ status: "ready", url: part.url });
	});
});
