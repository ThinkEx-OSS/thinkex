import * as React from "react";

import {
	getElementScrollTop,
	getElementViewportTop,
	getMaxScrollTop,
	getTailSpacerHeight,
} from "./geometry";
import { AUTOSCROLLING_CLEAR_DELAY, SCROLL_POSITION_EPSILON } from "./types";
import type { MessageScrollerScrollOptions } from "./types";
import type { MessageScrollerRefs } from "./use-message-scroller-refs";

// Imperative scroll primitives, split from the controller so the move mechanics
// live apart from the policy that decides when to run them. Each command resolves
// a target scrollTop and returns false when the viewport is not mounted yet.
function useMessageScrollerCommands({
	anchorScrollBehavior = "auto",
	refs,
	commitScrollState,
	scheduleStateCommit,
}: {
	anchorScrollBehavior?: ScrollBehavior;
	refs: MessageScrollerRefs;
	commitScrollState: () => void;
	scheduleStateCommit: () => void;
}) {
	const {
		streamingTurnRef,
		autoScrollRef,
		autoscrollingRef,
		autoscrollingTimeoutRef,
		contentRef,
		modeRef,
		prependRestoreRef,
		scrollMarginRef,
		scrollPreviousItemPeekRef,
		spacerGapRef,
		spacerHeightRef,
		spacerRef,
		viewportRef,
	} = refs;

	const setAutoScrolling = React.useCallback(
		(autoscrolling: boolean) => {
			if (autoscrollingTimeoutRef.current !== null) {
				window.clearTimeout(autoscrollingTimeoutRef.current);
				autoscrollingTimeoutRef.current = null;
			}

			if (autoscrollingRef.current !== autoscrolling) {
				autoscrollingRef.current = autoscrolling;
				commitScrollState();
			}

			if (autoscrolling) {
				autoscrollingTimeoutRef.current = window.setTimeout(() => {
					autoscrollingTimeoutRef.current = null;
					autoscrollingRef.current = false;
					commitScrollState();
				}, AUTOSCROLLING_CLEAR_DELAY);
			}
		},
		[autoscrollingRef, autoscrollingTimeoutRef, commitScrollState],
	);

	const setTailSpacerHeight = React.useCallback(
		(height: number) => {
			const spacer = spacerRef.current;

			if (!spacer) {
				return;
			}

			const nextHeight = Math.max(0, Math.ceil(height));

			if (spacerHeightRef.current === nextHeight) {
				return;
			}

			spacerHeightRef.current = nextHeight;
			spacer.hidden = nextHeight === 0;
			spacer.style.height = `${nextHeight}px`;
			spacer.style.marginTop = nextHeight > 0 ? `${-spacerGapRef.current}px` : "";
		},
		[spacerGapRef, spacerHeightRef, spacerRef],
	);

	const scrollToPosition = React.useCallback(
		(
			scrollTop: number,
			{
				behavior = "auto",
				autoscrolling = false,
			}: {
				behavior?: ScrollBehavior;
				autoscrolling?: boolean;
			} = {},
		) => {
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

			if (autoscrolling) {
				setAutoScrolling(true);
			}

			viewport.scrollTo({
				top: nextScrollTop,
				behavior,
			});
			scheduleStateCommit();
		},
		[commitScrollState, scheduleStateCommit, setAutoScrolling, viewportRef],
	);

	const scrollToStart = React.useCallback(
		({ behavior = "auto" }: MessageScrollerScrollOptions = {}) => {
			if (!viewportRef.current) {
				return false;
			}

			setTailSpacerHeight(0);
			streamingTurnRef.current = null;
			modeRef.current = "free-scrolling";
			scrollToPosition(0, { behavior });

			return true;
		},
		[modeRef, scrollToPosition, setTailSpacerHeight, streamingTurnRef, viewportRef],
	);

	const scrollToEnd = React.useCallback(
		({ behavior = "auto" }: MessageScrollerScrollOptions = {}) => {
			const viewport = viewportRef.current;

			if (!viewport) {
				return false;
			}

			setTailSpacerHeight(0);
			streamingTurnRef.current = null;
			modeRef.current = autoScrollRef.current ? "following-bottom" : "free-scrolling";
			scrollToPosition(getMaxScrollTop(viewport), {
				autoscrolling: behavior === "smooth",
				behavior,
			});

			return true;
		},
		[autoScrollRef, modeRef, scrollToPosition, setTailSpacerHeight, streamingTurnRef, viewportRef],
	);

	const scrollToElement = React.useCallback(
		(
			element: HTMLElement,
			{
				align = "start",
				behavior = "auto",
				scrollMargin = scrollMarginRef.current,
			}: MessageScrollerScrollOptions = {},
			{
				keepPreviousPeek = false,
			}: {
				keepPreviousPeek?: boolean;
			} = {},
		) => {
			const content = contentRef.current;
			const viewport = viewportRef.current;

			if (!content || !viewport || !content.contains(element)) {
				return false;
			}

			const scrollTop = getElementScrollTop({
				align,
				element,
				scrollMargin: keepPreviousPeek
					? scrollMargin + scrollPreviousItemPeekRef.current
					: scrollMargin,
				spacer: spacerRef.current,
				viewport,
			});

			const nextSpacerHeight = getTailSpacerHeight({
				content,
				scrollTop,
				spacer: spacerRef.current,
				viewport,
			});

			setTailSpacerHeight(nextSpacerHeight);
			// Seed the prepend anchor with the jump target so a prepend that lands
			// during a programmatic jump still preserves the jumped-to row.
			prependRestoreRef.current = {
				element,
				viewportTop: getElementViewportTop(element, viewport),
			};

			modeRef.current = keepPreviousPeek ? "anchored-to-message" : "settling-jump";
			streamingTurnRef.current = keepPreviousPeek ? element : null;

			scrollToPosition(scrollTop, { behavior });

			return true;
		},
		[
			contentRef,
			modeRef,
			prependRestoreRef,
			scrollMarginRef,
			scrollPreviousItemPeekRef,
			scrollToPosition,
			setTailSpacerHeight,
			spacerRef,
			streamingTurnRef,
			viewportRef,
		],
	);

	const reanchorToAnchoredMessage = React.useCallback(() => {
		const element = streamingTurnRef.current;

		if (!element || !element.isConnected || modeRef.current !== "anchored-to-message") {
			return false;
		}

		// Re-run the placement so the tail spacer is recomputed for the new content
		// height and the turn is held at the reading line.
		return scrollToElement(
			element,
			{ align: "start", behavior: anchorScrollBehavior },
			{ keepPreviousPeek: true },
		);
	}, [anchorScrollBehavior, modeRef, scrollToElement, streamingTurnRef]);

	return {
		reanchorToAnchoredMessage,
		scrollToElement,
		scrollToEnd,
		scrollToStart,
	};
}

export { useMessageScrollerCommands };
