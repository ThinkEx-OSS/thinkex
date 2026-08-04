import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDefaultWorkspaceThreadId } from "#/features/workspaces/ai/ai-thread-identity";
import { stageComposerPrompt } from "#/features/workspaces/composer/workspace-composer-actions";
import { useWorkspaceAiComposerDraftStore } from "#/features/workspaces/state/workspace-ai-composer-draft-store";
import {
	getWorkspaceUiSession,
	useWorkspaceUiStore,
} from "#/features/workspaces/state/workspace-ui-store";

const workspaceId = "workspace-1";
const threadId = getDefaultWorkspaceThreadId(workspaceId);

describe("stageComposerPrompt", () => {
	beforeEach(() => {
		vi.stubGlobal("localStorage", {
			getItem: vi.fn(() => null),
			removeItem: vi.fn(),
			setItem: vi.fn(),
		});
		useWorkspaceAiComposerDraftStore.setState({
			focusRequestByThreadId: {},
			textByThreadId: { [threadId]: "Existing draft" },
		});
		useWorkspaceUiStore.setState({ sessionsByWorkspaceId: {} });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("stages the prompt and reveals the mobile composer", () => {
		vi.stubGlobal("window", {
			matchMedia: () => ({ matches: false }),
		});

		stageComposerPrompt(workspaceId, "Build a widget");

		expect(
			getWorkspaceUiSession(useWorkspaceUiStore.getState().getSession(workspaceId)).chatSurfaceMode,
		).toBe("fullscreen");
		expect(useWorkspaceAiComposerDraftStore.getState().textByThreadId[threadId]).toBe(
			"Existing draft\n\nBuild a widget",
		);
		expect(useWorkspaceAiComposerDraftStore.getState().focusRequestByThreadId[threadId]).toBe(1);
	});
});
