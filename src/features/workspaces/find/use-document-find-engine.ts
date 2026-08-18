import { type Editor, useEditorState } from "@tiptap/react";
import { useEffect } from "react";

import {
	findScrollBehavior,
	type WorkspaceFindEngine,
} from "#/features/workspaces/find/use-workspace-find";

const emptyFindState = { activeIndex: -1, searchTerm: "", total: 0 };

/**
 * Searches the ProseMirror document rather than the rendered page, so it
 * reaches text the browser's own find cannot — collapsed sections included.
 */
export function useDocumentFindEngine(
	editor: Editor | null,
	query: string,
	caseSensitive: boolean,
): WorkspaceFindEngine {
	const { activeIndex, searchTerm, total } =
		useEditorState({
			editor,
			selector: ({ editor: currentEditor }) => {
				const storage = currentEditor?.storage.findAndReplace;

				return storage
					? {
							activeIndex: storage.currentIndex ?? -1,
							searchTerm: storage.searchTerm,
							total: storage.results.length,
						}
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

	// ProseMirror asks to scroll the selection into view when the extension moves
	// between results, but it refuses while the DOM selection sits outside the
	// editor — which is exactly where it sits, in the find input. So reveal the
	// match ourselves rather than leaving navigation silent in a long document.
	useEffect(() => {
		if (!editor || activeIndex < 0 || total === 0) {
			return;
		}

		const { node } = editor.view.domAtPos(editor.state.selection.from);
		const element = node instanceof Element ? node : node.parentElement;

		element?.scrollIntoView({ behavior: findScrollBehavior(), block: "center" });
	}, [activeIndex, editor, total]);

	return {
		activeIndex,
		total,
		// setSearchTerm is debounced, so the committed term lags the typed one.
		isSearching: searchTerm !== query,
		next: () => {
			editor?.commands.goToNextResult();
		},
		previous: () => {
			editor?.commands.goToPreviousResult();
		},
	};
}
