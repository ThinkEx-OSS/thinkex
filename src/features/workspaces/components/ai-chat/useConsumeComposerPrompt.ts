import { type RefObject, useEffect } from "react";

import {
	useWorkspaceAiComposerDraftPrompt,
	useWorkspaceAiComposerDraftStore,
} from "#/features/workspaces/state/workspace-ai-composer-draft-store";

type UseConsumeComposerPromptOptions = {
	workspaceId: string;
	setInput: (updater: (current: string) => string) => void;
	textareaRef: RefObject<HTMLTextAreaElement | null>;
};

/**
 * Seeds the composer with text staged via `stageComposerPrompt` (e.g. an item
 * viewer's "Ask AI to fix" button), then clears it from the store so it is
 * consumed exactly once. Existing composer text is preserved — the staged text
 * is appended rather than overwriting what the user already typed. The staged
 * text is never auto-sent; the user reviews and sends it themselves.
 */
export function useConsumeComposerPrompt({
	workspaceId,
	setInput,
	textareaRef,
}: UseConsumeComposerPromptOptions) {
	const pendingPrompt = useWorkspaceAiComposerDraftPrompt(workspaceId);
	const clearPrompt = useWorkspaceAiComposerDraftStore((state) => state.clearPrompt);

	useEffect(() => {
		if (!pendingPrompt) {
			return;
		}

		setInput((current) =>
			current.trim() ? `${current.trimEnd()}\n\n${pendingPrompt}` : pendingPrompt,
		);
		clearPrompt(workspaceId);

		requestAnimationFrame(() => {
			const textarea = textareaRef.current;
			if (!textarea) {
				return;
			}

			textarea.focus();
			const caret = textarea.value.length;
			textarea.setSelectionRange(caret, caret);
		});
	}, [pendingPrompt, workspaceId, clearPrompt, setInput, textareaRef]);
}
