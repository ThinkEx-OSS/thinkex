/**
 * What a surface must provide for Mod+F to work on it. Each surface searches a
 * different substrate — a PDF's text layer, the chat transcript's DOM, a
 * document's ProseMirror model — but they all drive the same find bar.
 *
 * Engines are declarative: they take the query as input and report results.
 * The bar owns the query, so no engine has to mirror it.
 */
export interface WorkspaceFindEngine {
	/** Matches for the current query. */
	total: number;
	/** Zero-based index of the highlighted match, or -1 when there is none. */
	activeIndex: number;
	/** True while a query is still resolving. */
	isSearching: boolean;
	next: () => void;
	previous: () => void;
}
