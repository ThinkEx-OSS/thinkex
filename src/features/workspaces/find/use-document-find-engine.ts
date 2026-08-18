import { type Editor, useEditorState } from "@tiptap/react";
import { useEffect } from "react";

import type { WorkspaceFindEngine } from "#/features/workspaces/find/use-workspace-find";

const emptyFindState = { activeIndex: -1, total: 0 };

/**
 * Searches the ProseMirror document rather than the rendered page, so it
 * reaches text the browser's own find cannot — collapsed sections included.
 */
export function useDocumentFindEngine(
	editor: Editor | null,
	query: string,
	caseSensitive: boolean,
): WorkspaceFindEngine {
	const { activeIndex, total } =
		useEditorState({
			editor,
			selector: ({ editor: currentEditor }) => {
				const storage = currentEditor?.storage.findAndReplace;

				return storage
					? { activeIndex: storage.currentIndex ?? -1, total: storage.results.length }
					: emptyFindState;
			},
		}) ?? emptyFindState;

	// Kept apart from the query on purpose. The extension debounces setSearchTerm
	// but applies setCaseSensitive immediately, and it re-runs a full search
	// whenever that meta key is merely present — so sending it per keystroke
	// would search the whole document on every keystroke.
	useEffect(() => {
		editor?.commands.setCaseSensitive(caseSensitive);
	}, [caseSensitive, editor]);

	useEffect(() => {
		if (query === "") {
			editor?.commands.clearSearch();
			return;
		}

		editor?.commands.setSearchTerm(query);
	}, [editor, query]);

	return {
		activeIndex,
		total,
		isSearching: false,
		next: () => {
			editor?.commands.goToNextResult();
		},
		previous: () => {
			editor?.commands.goToPreviousResult();
		},
	};
}
