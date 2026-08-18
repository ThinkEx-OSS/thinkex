import { type RefObject, useCallback, useEffect, useState } from "react";

import type { WorkspaceFindEngine } from "#/features/workspaces/find/use-workspace-find";

const ALL_HIGHLIGHT_KEY = "ai-chat-find";
const ACTIVE_HIGHLIGHT_KEY = "ai-chat-find-active";
const RESCAN_DEBOUNCE_MS = 150;
const TRANSCRIPT_SELECTOR = '[role="region"][aria-label="Messages"]';

function collectMatchRanges(root: Element, query: string, caseSensitive: boolean) {
	const ranges: Range[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const loweredQuery = query.toLowerCase();

	for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
		const parent = node.parentElement;

		if (!parent || parent.checkVisibility?.() === false) {
			continue;
		}

		const raw = node.textContent ?? "";
		const loweredRaw = raw.toLowerCase();
		// Case folding can change length ("İ" lowercases to two code units), which
		// would slide every later offset out of place and can push setEnd past the
		// node. Match those nodes exactly rather than mis-highlighting them.
		const foldable =
			!caseSensitive && loweredRaw.length === raw.length && loweredQuery.length === query.length;
		const text = foldable ? loweredRaw : raw;
		const needle = foldable ? loweredQuery : query;
		let matchIndex = text.indexOf(needle);

		while (matchIndex !== -1) {
			const range = document.createRange();
			range.setStart(node, matchIndex);
			range.setEnd(node, matchIndex + needle.length);
			ranges.push(range);
			matchIndex = text.indexOf(needle, matchIndex + needle.length);
		}
	}

	return ranges;
}

function scrollMatchIntoView(viewport: Element | null, match: Range | undefined) {
	if (!viewport || !match) {
		return;
	}

	const matchRect = match.getBoundingClientRect();
	const viewportRect = viewport.getBoundingClientRect();

	viewport.scrollTop += matchRect.top - viewportRect.top - viewportRect.height / 2;
}

/**
 * The chat transcript is plain DOM, not an editor, so this walks text nodes and
 * paints matches with the CSS Custom Highlight API — highlights that survive
 * streaming replies because they never touch the DOM.
 */
export function useAiChatFindEngine(
	panelRef: RefObject<HTMLElement | null>,
	query: string,
	caseSensitive: boolean,
): WorkspaceFindEngine {
	// resolvedQuery is the query these matches belong to, which is what makes the
	// debounce observable: while it lags the typed query, the search is pending.
	const [{ activeIndex, matches, resolvedQuery }, setResults] = useState<{
		activeIndex: number;
		matches: Range[];
		resolvedQuery: string;
	}>({ activeIndex: -1, matches: [], resolvedQuery: "" });

	const getViewport = useCallback(
		() => panelRef.current?.querySelector(TRANSCRIPT_SELECTOR) ?? null,
		[panelRef],
	);
	const scan = useCallback(() => {
		const viewport = getViewport();

		return viewport && query !== "" ? collectMatchRanges(viewport, query, caseSensitive) : [];
	}, [caseSensitive, getViewport, query]);

	// Scanning walks the whole transcript, so it is debounced whether the query
	// changed or the transcript did. Observing the panel rather than the
	// transcript matters: switching threads replaces the transcript element
	// outright, and watching the stable panel makes that swap just another
	// mutation that triggers a rescan.
	useEffect(() => {
		const panel = panelRef.current;

		if (!panel) {
			return;
		}

		let debounce: ReturnType<typeof setTimeout> | undefined;
		const rescan = (isNewQuery: boolean) => {
			clearTimeout(debounce);
			debounce = setTimeout(() => {
				const nextMatches = scan();

				// Clamp as we write so the stored index is always a real one.
				setResults((current) => ({
					activeIndex:
						nextMatches.length === 0
							? -1
							: isNewQuery
								? 0
								: Math.min(Math.max(current.activeIndex, 0), nextMatches.length - 1),
					matches: nextMatches,
					resolvedQuery: query,
				}));

				if (isNewQuery) {
					scrollMatchIntoView(getViewport(), nextMatches[0]);
				}
			}, RESCAN_DEBOUNCE_MS);
		};

		rescan(true);

		if (query === "") {
			return () => clearTimeout(debounce);
		}

		const observer = new MutationObserver(() => rescan(false));

		observer.observe(panel, { characterData: true, childList: true, subtree: true });

		return () => {
			clearTimeout(debounce);
			observer.disconnect();
		};
	}, [getViewport, panelRef, query, scan]);

	useEffect(() => {
		const registry = globalThis.CSS?.highlights;

		if (!registry) {
			return;
		}

		if (matches.length === 0) {
			registry.delete(ALL_HIGHLIGHT_KEY);
			registry.delete(ACTIVE_HIGHLIGHT_KEY);
			return;
		}

		registry.set(ALL_HIGHLIGHT_KEY, new Highlight(...matches));

		const activeMatch = matches[activeIndex];

		if (activeMatch) {
			registry.set(ACTIVE_HIGHLIGHT_KEY, new Highlight(activeMatch));
		} else {
			registry.delete(ACTIVE_HIGHLIGHT_KEY);
		}

		return () => {
			registry.delete(ALL_HIGHLIGHT_KEY);
			registry.delete(ACTIVE_HIGHLIGHT_KEY);
		};
	}, [activeIndex, matches]);

	const goToMatch = (offset: number) => {
		if (matches.length === 0) {
			return;
		}

		const wrapped = (activeIndex + offset + matches.length) % matches.length;

		setResults({ activeIndex: wrapped, matches, resolvedQuery });
		scrollMatchIntoView(getViewport(), matches[wrapped]);
	};

	return {
		activeIndex,
		total: matches.length,
		isSearching: resolvedQuery !== query,
		next: () => goToMatch(1),
		previous: () => goToMatch(-1),
	};
}
