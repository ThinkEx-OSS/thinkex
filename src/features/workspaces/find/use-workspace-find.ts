import { useState } from "react";

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

/**
 * The query an engine searches for. Lives above the engine because the engine
 * hook takes it as an argument; everything else about the bar the bar owns.
 */
export function useWorkspaceFind() {
	const [rawQuery, setRawQuery] = useState("");
	const [caseSensitive, setCaseSensitive] = useState(false);

	return {
		caseSensitive,
		// Normalized once here so every surface agrees on what "empty" means and
		// searches exactly what was typed. Engines never trim.
		query: rawQuery.trim() === "" ? "" : rawQuery,
		rawQuery,
		setQuery: setRawQuery,
		toggleCaseSensitive: () => setCaseSensitive((current) => !current),
	};
}

export type WorkspaceFindState = ReturnType<typeof useWorkspaceFind>;
