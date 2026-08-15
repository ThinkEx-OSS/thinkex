import * as React from "react";

import {
	canScrollToEnd,
	getElementViewportTop,
	getFirstVisibleMessageItem,
	getFlexGap,
	getLastScrollAnchor,
	getMaxScrollTop,
	getMessageScrollerItems,
	getRowScrollTop,
	getTailSpacerHeight,
} from "./geometry";
import {
	AUTOSCROLLING_CLEAR_DELAY,
	DEFAULT_SCROLL_PREVIOUS_ITEM_PEEK,
	SCROLL_POSITION_EPSILON,
} from "./types";
import type { MessageScrollerContextValue, MessageScrollerProviderProps } from "./types";

// Minimal external store for the scroll-to-end button, so scrolling does not
// re-render the transcript.
function createCanScrollToEndStore() {
	let snapshot = false;
	const listeners = new Set<() => void>();

	return {
		get: () => snapshot,
		set: (next: boolean) => {
			if (snapshot === next) {
				return;
			}

			snapshot = next;

			for (const listener of listeners) {
				listener();
			}
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener);

			return () => {
				listeners.delete(listener);
			};
		},
	};
}

// The scroller has one piece of mode state: the turn held at the reading line.
// While a row is anchored, resizes re-run its placement. Once the reader scrolls
// away the anchor is dropped and their position is preserved as-is.
function useMessageScroller({
	appendedAnchorScrollBehavior = "auto",
	scrollPreviousItemPeek = DEFAULT_SCROLL_PREVIOUS_ITEM_PEEK,
}: MessageScrollerProviderProps) {
	const contentRef = React.useRef<HTMLDivElement | null>(null);
	const spacerRef = React.useRef<HTMLDivElement | null>(null);
	const viewportRef = React.useRef<HTMLDivElement | null>(null);

	// The turn pinned at the reading line, or null while free-scrolling, together
	// with the transition it was placed with — re-pinning replays it so a send that
	// glided into place keeps gliding as the reply resizes the content beneath it.
	const anchoredRowRef = React.useRef<{ behavior: ScrollBehavior; element: HTMLElement } | null>(
		null,
	);
	// Where the reader's first visible row sits, restored when content above it
	// resizes. The viewport opts out of native scroll anchoring, so this is the
	// only thing holding their place.
	const readingAnchorRef = React.useRef<{
		element: HTMLElement;
		viewportTop: number;
	} | null>(null);

	// Turns already accounted for, by message id. Not an index: rows are added and
	// removed in the same commit (an error row clearing as the next turn and its
	// pending row arrive), so a count-based diff misses the turn that was sent. Not
	// node identity either, so that React recreating a row's DOM node cannot read
	// as a brand new turn and yank the reader back to an old one.
	const seenRowIdsRef = React.useRef(new Set<string>());
	const openingScrollAppliedRef = React.useRef(false);
	const spacerGapRef = React.useRef(0);
	const spacerHeightRef = React.useRef(0);

	const autoscrollingTimeoutRef = React.useRef<number | null>(null);
	const resizeFrameRef = React.useRef<number | null>(null);
	const stateFrameRef = React.useRef<number | null>(null);

	// Latest prop values, so the callbacks wired to observers stay stable.
	const appendedBehaviorRef = React.useRef(appendedAnchorScrollBehavior);
	const peekRef = React.useRef(scrollPreviousItemPeek);

	React.useLayoutEffect(() => {
		appendedBehaviorRef.current = appendedAnchorScrollBehavior;
		peekRef.current = scrollPreviousItemPeek;
	}, [appendedAnchorScrollBehavior, scrollPreviousItemPeek]);

	const [store] = React.useState(createCanScrollToEndStore);

	const commitScrollState = React.useCallback(() => {
		store.set(
			canScrollToEnd({
				content: contentRef.current,
				spacer: spacerRef.current,
				viewport: viewportRef.current,
			}),
		);
	}, [store]);

	const scheduleStateCommit = React.useCallback(() => {
		if (stateFrameRef.current !== null) {
			return;
		}

		stateFrameRef.current = window.requestAnimationFrame(() => {
			stateFrameRef.current = null;
			commitScrollState();
		});
	}, [commitScrollState]);

	// Hides the scrollbar for the length of a programmatic smooth scroll.
	const markAutoScrolling = React.useCallback(() => {
		if (autoscrollingTimeoutRef.current !== null) {
			window.clearTimeout(autoscrollingTimeoutRef.current);
		}

		viewportRef.current?.setAttribute("data-autoscrolling", "");
		autoscrollingTimeoutRef.current = window.setTimeout(() => {
			autoscrollingTimeoutRef.current = null;
			viewportRef.current?.removeAttribute("data-autoscrolling");
		}, AUTOSCROLLING_CLEAR_DELAY);
	}, []);

	const setTailSpacerHeight = React.useCallback((height: number) => {
		const spacer = spacerRef.current;
		const nextHeight = Math.max(0, Math.ceil(height));

		if (!spacer || spacerHeightRef.current === nextHeight) {
			return;
		}

		spacerHeightRef.current = nextHeight;
		spacer.hidden = nextHeight === 0;
		spacer.style.height = `${nextHeight}px`;
		spacer.style.marginTop = nextHeight > 0 ? `${-spacerGapRef.current}px` : "";
	}, []);

	const scrollToPosition = React.useCallback(
		(scrollTop: number, behavior: ScrollBehavior) => {
			const viewport = viewportRef.current;

			if (!viewport) {
				return;
			}

			const nextScrollTop = Math.max(0, scrollTop);

			if (Math.abs(viewport.scrollTop - nextScrollTop) <= SCROLL_POSITION_EPSILON) {
				viewport.scrollTop = nextScrollTop;
				commitScrollState();
				return;
			}

			viewport.scrollTo({ top: nextScrollTop, behavior });
			scheduleStateCommit();
		},
		[commitScrollState, scheduleStateCommit],
	);

	const scrollToEnd = React.useCallback(
		({ behavior = "auto" }: { behavior?: ScrollBehavior } = {}) => {
			const viewport = viewportRef.current;

			if (!viewport) {
				return false;
			}

			setTailSpacerHeight(0);
			anchoredRowRef.current = null;

			if (behavior === "smooth") {
				markAutoScrolling();
			}

			scrollToPosition(getMaxScrollTop(viewport), behavior);

			return true;
		},
		[markAutoScrolling, scrollToPosition, setTailSpacerHeight],
	);

	// Pins a row to the reading line: size the tail spacer so it can reach the top,
	// then scroll it there.
	const anchorRow = React.useCallback(
		(element: HTMLElement, behavior: ScrollBehavior) => {
			const content = contentRef.current;
			const viewport = viewportRef.current;

			if (!content || !viewport || !content.contains(element)) {
				return false;
			}

			const scrollTop = getRowScrollTop({
				content,
				element,
				peek: peekRef.current,
				viewport,
			});

			setTailSpacerHeight(
				getTailSpacerHeight({ content, scrollTop, spacer: spacerRef.current, viewport }),
			);
			anchoredRowRef.current = { behavior, element };
			scrollToPosition(scrollTop, behavior);

			return true;
		},
		[scrollToPosition, setTailSpacerHeight],
	);

	const captureReadingAnchor = React.useCallback(() => {
		const content = contentRef.current;
		const viewport = viewportRef.current;

		if (!content || !viewport) {
			readingAnchorRef.current = null;
			return;
		}

		const anchor = getFirstVisibleMessageItem({ content, spacer: spacerRef.current, viewport });

		readingAnchorRef.current = anchor
			? { element: anchor, viewportTop: getElementViewportTop(anchor, viewport) }
			: null;
	}, []);

	const restoreReadingAnchor = React.useCallback(() => {
		const anchor = readingAnchorRef.current;
		const viewport = viewportRef.current;

		if (!anchor || !viewport || !anchor.element.isConnected) {
			return false;
		}

		const delta = getElementViewportTop(anchor.element, viewport) - anchor.viewportTop;

		if (Math.abs(delta) <= SCROLL_POSITION_EPSILON) {
			return false;
		}

		viewport.scrollTop += delta;
		anchor.viewportTop = getElementViewportTop(anchor.element, viewport);
		scheduleStateCommit();

		return true;
	}, [scheduleStateCommit]);

	// Opens a saved transcript on its last turn, applied once.
	const applyOpeningScroll = React.useCallback(
		(items: HTMLElement[]) => {
			if (openingScrollAppliedRef.current || items.length === 0) {
				return false;
			}

			const lastAnchor = getLastScrollAnchor(items);
			const handled = lastAnchor
				? anchorRow(lastAnchor, "auto")
				: scrollToEnd({ behavior: "auto" });

			openingScrollAppliedRef.current = handled;

			return handled;
		},
		[anchorRow, scrollToEnd],
	);

	const handleContentChange = React.useCallback(() => {
		const content = contentRef.current;

		if (!content) {
			return;
		}

		const items = getMessageScrollerItems(content, spacerRef.current);
		const seenRowIds = seenRowIdsRef.current;
		let newAnchor: HTMLElement | null = null;

		for (const item of items) {
			const messageId = item.dataset.messageId;

			// Rows without an id are transient (typing, errors) and never anchors.
			if (!messageId || seenRowIds.has(messageId)) {
				continue;
			}

			seenRowIds.add(messageId);

			if (item.dataset.scrollAnchor === "true") {
				newAnchor = item;
			}
		}

		// The opening restore claims the first non-empty render, so the rows it just
		// marked as seen do not also read as newly sent turns.
		if (!applyOpeningScroll(items)) {
			if (newAnchor) {
				anchorRow(newAnchor, appendedBehaviorRef.current);
			} else {
				commitScrollState();
			}
		}

		captureReadingAnchor();
	}, [anchorRow, applyOpeningScroll, captureReadingAnchor, commitScrollState]);

	const reconcileResize = React.useCallback(() => {
		const anchoredRow = anchoredRowRef.current;

		// Hold the anchored turn in place as content below it resizes (a reply
		// streaming in, or a transient marker collapsing) — otherwise the shrinking
		// content lets the browser clamp scrollTop and the turn drops. Failing that,
		// hold the reader's first visible row where they left it as rows above it
		// resize (an image loading, math laying out) — the viewport opts out of
		// native scroll anchoring, so nothing else would.
		const held =
			(anchoredRow?.element.isConnected === true &&
				anchorRow(anchoredRow.element, anchoredRow.behavior)) ||
			restoreReadingAnchor();

		if (!held) {
			commitScrollState();
		}
	}, [anchorRow, commitScrollState, restoreReadingAnchor]);

	const handleResize = React.useCallback(() => {
		if (resizeFrameRef.current !== null) {
			return;
		}

		resizeFrameRef.current = window.requestAnimationFrame(() => {
			resizeFrameRef.current = null;
			reconcileResize();
		});
	}, [reconcileResize]);

	const userScrollIntent = React.useCallback(() => {
		const viewport = viewportRef.current;

		if (!anchoredRowRef.current || !viewport) {
			return;
		}

		// A deliberate gesture releases the anchor, and stops an in-flight smooth
		// scroll so re-pinning never fights the reader.
		viewport.scrollTo({ top: viewport.scrollTop, behavior: "auto" });
		anchoredRowRef.current = null;
	}, []);

	const syncAfterScroll = React.useCallback(
		({ userIntent = false }: { userIntent?: boolean } = {}) => {
			if (userIntent) {
				userScrollIntent();
			}

			commitScrollState();

			if (!anchoredRowRef.current) {
				captureReadingAnchor();
			}
		},
		[captureReadingAnchor, commitScrollState, userScrollIntent],
	);

	const setContentElement = React.useCallback((element: HTMLDivElement | null) => {
		contentRef.current = element;
	}, []);

	const setViewportElement = React.useCallback((element: HTMLDivElement | null) => {
		viewportRef.current = element;
	}, []);

	const setSpacerElement = React.useCallback((element: HTMLDivElement | null) => {
		spacerRef.current = element;
		spacerGapRef.current = getFlexGap(element?.parentElement ?? null);
	}, []);

	// Re-run once the whole tree is mounted. MessageScrollerContent's own layout
	// effect fires before the viewport's ref is attached (React commits child
	// refs and effects first), so on mount the opening scroll has no viewport to
	// measure and defers to here.
	React.useLayoutEffect(() => {
		handleContentChange();
	}, [handleContentChange]);

	React.useEffect(() => {
		return () => {
			// Reset the handle after cancelling. StrictMode replays effects on the same
			// refs, so an id left non-null makes the scheduler on remount think a frame
			// is still pending and never reschedule.
			for (const frameRef of [resizeFrameRef, stateFrameRef]) {
				if (frameRef.current !== null) {
					window.cancelAnimationFrame(frameRef.current);
					frameRef.current = null;
				}
			}

			if (autoscrollingTimeoutRef.current !== null) {
				window.clearTimeout(autoscrollingTimeoutRef.current);
				autoscrollingTimeoutRef.current = null;
			}
		};
	}, []);

	return React.useMemo<MessageScrollerContextValue>(
		() => ({
			getCanScrollToEnd: store.get,
			handleContentChange,
			handleResize,
			scrollToEnd,
			setContentElement,
			setSpacerElement,
			setViewportElement,
			subscribeCanScrollToEnd: store.subscribe,
			syncAfterScroll,
			userScrollIntent,
			viewportRef,
		}),
		[
			handleContentChange,
			handleResize,
			scrollToEnd,
			setContentElement,
			setSpacerElement,
			setViewportElement,
			store,
			syncAfterScroll,
			userScrollIntent,
		],
	);
}

export { useMessageScroller };
