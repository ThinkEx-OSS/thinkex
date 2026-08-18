import { MatchFlag } from "@embedpdf/models";
import { useScrollCapability } from "@embedpdf/plugin-scroll/react";
import { useSearch } from "@embedpdf/plugin-search/react";
import { useEffect } from "react";

import type { WorkspaceFindEngine } from "#/features/workspaces/find/use-workspace-find";

/**
 * Drives the PDF text layer's own search plugin. Must be called inside the
 * viewer's plugin context.
 */
export function usePdfFindEngine(
	documentId: string,
	query: string,
	caseSensitive: boolean,
): WorkspaceFindEngine {
	const { state, provides: search } = useSearch(documentId);
	const { provides: scroll } = useScrollCapability();

	useEffect(() => {
		search?.setFlags(caseSensitive ? [MatchFlag.MatchCase] : []);
	}, [caseSensitive, search]);

	useEffect(() => {
		if (query === "") {
			search?.stopSearch();
			return;
		}

		search?.searchAllPages(query);
	}, [query, search]);

	// The plugin moves the active match but deliberately never scrolls; jumping
	// to the hit reuses the same scroll capability as citation reveals.
	useEffect(() => {
		if (state.activeResultIndex < 0 || state.loading) {
			return;
		}

		const activeResult = state.results[state.activeResultIndex];

		if (!activeResult) {
			return;
		}

		const topLeft = activeResult.rects.reduce(
			(min, rect) => ({
				x: Math.min(min.x, rect.origin.x),
				y: Math.min(min.y, rect.origin.y),
			}),
			{ x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY },
		);

		scroll?.forDocument(documentId).scrollToPage({
			pageNumber: activeResult.pageIndex + 1,
			pageCoordinates: topLeft,
		});
	}, [documentId, scroll, state.activeResultIndex, state.loading, state.results]);

	return {
		activeIndex: state.activeResultIndex,
		total: state.total,
		isSearching: state.loading,
		next: () => {
			search?.nextResult();
		},
		previous: () => {
			search?.previousResult();
		},
	};
}
