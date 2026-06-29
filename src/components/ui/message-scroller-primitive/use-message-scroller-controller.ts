import * as React from "react";

import {
	getContentBottom,
	getElementTop,
	getElementViewportTop,
	getFirstVisibleMessageItem,
	getFlexGap,
	getLastScrollAnchor,
	getMessageScrollerItems,
	getMessageScrollerScrollable,
	getNewScrollAnchor,
	hasMultipleNewScrollAnchors,
} from "./geometry";
import {
	DEFAULT_SCROLL_EDGE_THRESHOLD,
	DEFAULT_SCROLL_MARGIN,
	DEFAULT_SCROLL_PREVIOUS_ITEM_PEEK,
	SCROLL_POSITION_EPSILON,
} from "./types";
import type {
	MessageScrollerContextValue,
	MessageScrollerProviderProps,
	MessageScrollerScrollable,
} from "./types";
import { useMessageScrollerCommands } from "./use-message-scroller-commands";
import { useMessageScrollerRefs } from "./use-message-scroller-refs";

// Builds a ref callback that stores the node and runs onMount once it attaches.
function useElementRef(elementRef: React.RefObject<HTMLDivElement | null>, onMount: () => void) {
	return React.useCallback(
		(element: HTMLDivElement | null) => {
			elementRef.current = element;

			if (element) {
				onMount();
			}
		},
		[elementRef, onMount],
	);
}

// Orchestrator hook. Decides when to scroll and delegates the moves to
// useMessageScrollerCommands; state commits are coalesced on a requestAnimationFrame
// and torn down on cleanup for StrictMode safety.
function useMessageScrollerController({
	appendedAnchorScrollBehavior = "auto",
	autoScroll = false,
	defaultScrollPosition = "end",
	scrollEdgeThreshold = DEFAULT_SCROLL_EDGE_THRESHOLD,
	scrollPreviousItemPeek = DEFAULT_SCROLL_PREVIOUS_ITEM_PEEK,
	scrollMargin = DEFAULT_SCROLL_MARGIN,
}: MessageScrollerProviderProps) {
	const refs = useMessageScrollerRefs({
		autoScroll,
		scrollEdgeThreshold,
		scrollMargin,
		scrollPreviousItemPeek,
	});

	const {
		streamingTurnRef,
		autoScrollRef,
		autoscrollingRef,
		autoscrollingTimeoutRef,
		contentRef,
		defaultScrollPositionAppliedRef,
		firstItemRef,
		itemCountRef,
		modeRef,
		prependRestoreRef,
		preserveScrollOnPrependRef,
		rootRef,
		scrollEdgeThresholdRef,
		spacerGapRef,
		spacerRef,
		stateFrameRef,
		stateStore,
		viewportRef,
	} = refs;

	const previousDefaultScrollPositionRef = React.useRef(defaultScrollPosition);

	React.useLayoutEffect(() => {
		if (previousDefaultScrollPositionRef.current !== defaultScrollPosition) {
			previousDefaultScrollPositionRef.current = defaultScrollPosition;
			defaultScrollPositionAppliedRef.current = false;
		}
	}, [defaultScrollPosition, defaultScrollPositionAppliedRef]);

	const writeStateAttributes = React.useCallback(
		(state: MessageScrollerScrollable) => {
			const root = rootRef.current;
			const viewport = viewportRef.current;
			const scrollable = [state.start && "start", state.end && "end"].filter(Boolean).join(" ");
			const autoScrolling = autoscrollingRef.current;

			for (const element of [root, viewport]) {
				if (!element) {
					continue;
				}

				if (scrollable) {
					element.setAttribute("data-scrollable", scrollable);
				} else {
					element.removeAttribute("data-scrollable");
				}

				element.toggleAttribute("data-autoscrolling", autoScrolling);
			}
		},
		[autoscrollingRef, rootRef, viewportRef],
	);

	// Owns the one follow-bottom transition: arm at the bottom, release on any
	// scroll away (including a scrollbar drag), suppressed during a programmatic
	// scroll so the auto-scroll animation cannot release itself.
	const reconcileFollowMode = React.useCallback(
		(scrollable: MessageScrollerScrollable) => {
			if (autoScrollRef.current && !scrollable.end && modeRef.current === "free-scrolling") {
				modeRef.current = "following-bottom";
			} else if (
				modeRef.current === "following-bottom" &&
				scrollable.end &&
				!autoscrollingRef.current
			) {
				modeRef.current = "free-scrolling";
			}
		},
		[autoScrollRef, autoscrollingRef, modeRef],
	);

	const commitScrollState = React.useCallback(() => {
		const nextState = getMessageScrollerScrollable({
			content: contentRef.current,
			scrollEdgeThreshold: scrollEdgeThresholdRef.current,
			spacer: spacerRef.current,
			viewport: viewportRef.current,
		});

		reconcileFollowMode(nextState);
		writeStateAttributes(nextState);
		stateStore.setSnapshot(nextState);
	}, [
		contentRef,
		reconcileFollowMode,
		scrollEdgeThresholdRef,
		spacerRef,
		stateStore,
		viewportRef,
		writeStateAttributes,
	]);

	const scheduleStateCommit = React.useCallback(() => {
		if (stateFrameRef.current !== null) {
			return;
		}

		stateFrameRef.current = window.requestAnimationFrame(() => {
			stateFrameRef.current = null;
			commitScrollState();
		});
	}, [commitScrollState, stateFrameRef]);

	const { reanchorToAnchoredMessage, scrollToElement, scrollToEnd, scrollToStart } =
		useMessageScrollerCommands({
			anchorScrollBehavior: appendedAnchorScrollBehavior,
			refs,
			commitScrollState,
			scheduleStateCommit,
		});

	const restorePrependedAnchor = React.useCallback(() => {
		const anchor = prependRestoreRef.current;
		const viewport = viewportRef.current;

		if (!anchor || !viewport || !anchor.element.isConnected) {
			return false;
		}

		// Compare the anchor relative to the viewport, not to the content. Native
		// scroll anchoring leaves the viewport-relative position unchanged, so this
		// is a no-op where the browser already handled the prepend and only corrects
		// the scroll where it did not (e.g. Safari) — without trusting a capability
		// flag, which some engines report incorrectly.
		const nextViewportTop = getElementViewportTop(anchor.element, viewport);
		const delta = nextViewportTop - anchor.viewportTop;

		if (Math.abs(delta) <= SCROLL_POSITION_EPSILON) {
			return false;
		}

		viewport.scrollTop += delta;
		anchor.viewportTop = getElementViewportTop(anchor.element, viewport);
		scheduleStateCommit();

		return true;
	}, [prependRestoreRef, scheduleStateCommit, viewportRef]);

	const capturePrependAnchor = React.useCallback(() => {
		const content = contentRef.current;
		const viewport = viewportRef.current;

		if (!content || !viewport) {
			prependRestoreRef.current = null;
			return;
		}

		const anchor = getFirstVisibleMessageItem({
			content,
			spacer: spacerRef.current,
			viewport,
		});

		prependRestoreRef.current = anchor
			? {
					element: anchor,
					viewportTop: getElementViewportTop(anchor, viewport),
				}
			: null;
	}, [contentRef, prependRestoreRef, spacerRef, viewportRef]);

	const applyDefaultScrollPosition = React.useCallback(() => {
		if (
			!defaultScrollPosition ||
			defaultScrollPositionAppliedRef.current ||
			itemCountRef.current === 0
		) {
			return false;
		}

		let handled = false;

		if (defaultScrollPosition === "last-anchor") {
			const content = contentRef.current;
			const viewport = viewportRef.current;
			const anchor =
				content && viewport
					? getLastScrollAnchor(getMessageScrollerItems(content, spacerRef.current))
					: null;

			if (!content || !viewport || !anchor) {
				handled = scrollToEnd({ behavior: "auto" });
			} else {
				const anchorTop = getElementTop(anchor, viewport);
				const contentBottom = getContentBottom({
					content,
					spacer: spacerRef.current,
					viewport,
				});
				// A short last turn already fits below the anchor, so opening at the end
				// shows the whole turn without leaving a blank gap beneath it.
				const lastTurnFits = contentBottom - anchorTop <= viewport.clientHeight;

				handled = lastTurnFits
					? scrollToEnd({ behavior: "auto" })
					: scrollToElement(anchor, { align: "start" }, { keepPreviousPeek: true });
			}
		} else {
			handled =
				defaultScrollPosition === "end"
					? scrollToEnd({ behavior: "auto" })
					: scrollToStart({ behavior: "auto" });
		}

		if (!handled) {
			return false;
		}

		defaultScrollPositionAppliedRef.current = true;

		return true;
	}, [
		contentRef,
		defaultScrollPosition,
		defaultScrollPositionAppliedRef,
		itemCountRef,
		scrollToElement,
		scrollToEnd,
		scrollToStart,
		spacerRef,
		viewportRef,
	]);

	const handleContentChange = React.useCallback(() => {
		const content = contentRef.current;

		if (!content) {
			return;
		}

		const items = getMessageScrollerItems(content, spacerRef.current);
		const previousItemCount = itemCountRef.current;
		const previousFirstItem = firstItemRef.current;

		itemCountRef.current = items.length;
		firstItemRef.current = items[0] ?? null;

		// Reconcile the scroll position with the new content. Every path re-captures
		// the prepend anchor afterward, so each branch just returns.
		//
		// Branch order is load-bearing: first-content, prepended, appended, updated.
		const reconcileScrollPosition = () => {
			if (previousItemCount === 0) {
				if (applyDefaultScrollPosition()) {
					return;
				}

				if (items.length > 0 && autoScrollRef.current && scrollToEnd({ behavior: "auto" })) {
					return;
				}

				commitScrollState();
				return;
			}

			const previousFirstItemIndex = previousFirstItem ? items.indexOf(previousFirstItem) : -1;
			const didPrepend = preserveScrollOnPrependRef.current && previousFirstItemIndex > 0;

			if (didPrepend) {
				// Prepended rows are not new appends. Restore the prior scroll position.
				// The restore is a no-op where native scroll anchoring already did it.
				if (!restorePrependedAnchor()) {
					commitScrollState();
				}
				return;
			}

			if (items.length > previousItemCount) {
				const anchor = getNewScrollAnchor(items, previousItemCount);

				if (anchor) {
					// While the reader is following the live end, a batch of several
					// anchored turns arriving at once should keep following the end — not
					// yank back to anchor the first turn of the batch. A single new anchor
					// still moves to the top as usual.
					if (
						autoScrollRef.current &&
						modeRef.current === "following-bottom" &&
						hasMultipleNewScrollAnchors(items, previousItemCount)
					) {
						scrollToEnd({ behavior: "auto" });
						return;
					}

					scrollToElement(
						anchor,
						{ align: "start", behavior: appendedAnchorScrollBehavior },
						{ keepPreviousPeek: true },
					);
					return;
				}
			}

			// Appends with no new anchor (and content-only updates) fall through here:
			// keep following the end if we still are, otherwise just recommit state.
			if (modeRef.current === "following-bottom" && autoScrollRef.current) {
				scrollToEnd({ behavior: "auto" });
			} else {
				commitScrollState();
			}
		};

		reconcileScrollPosition();
		capturePrependAnchor();
	}, [
		applyDefaultScrollPosition,
		capturePrependAnchor,
		commitScrollState,
		appendedAnchorScrollBehavior,
		autoScrollRef,
		contentRef,
		firstItemRef,
		itemCountRef,
		modeRef,
		preserveScrollOnPrependRef,
		restorePrependedAnchor,
		scrollToElement,
		scrollToEnd,
		spacerRef,
	]);

	const handleResize = React.useCallback(() => {
		if (modeRef.current === "following-bottom" && autoScrollRef.current) {
			scrollToEnd({ behavior: "auto" });
			return;
		}

		// Hold the anchored turn in place as content below it resizes (a reply
		// streaming in, or a transient marker collapsing) — otherwise the shrinking
		// content lets the browser clamp scrollTop and the turn drops.
		if (reanchorToAnchoredMessage()) {
			return;
		}

		scheduleStateCommit();
	}, [autoScrollRef, modeRef, reanchorToAnchoredMessage, scheduleStateCommit, scrollToEnd]);

	const userScrollIntent = React.useCallback(() => {
		if (
			modeRef.current === "following-bottom" ||
			modeRef.current === "anchored-to-message" ||
			modeRef.current === "settling-jump"
		) {
			// A deliberate gesture releases auto-follow, turn-anchoring, and an in-flight
			// programmatic jump so re-pinning (and re-arming) never fights the reader.
			const viewport = viewportRef.current;
			viewport?.scrollTo({ top: viewport.scrollTop, behavior: "auto" });
			streamingTurnRef.current = null;
			modeRef.current = "free-scrolling";
		}
	}, [modeRef, streamingTurnRef, viewportRef]);

	const mirrorStateAttributes = React.useCallback(
		() => writeStateAttributes(stateStore.getSnapshot()),
		[stateStore, writeStateAttributes],
	);

	const setRootElement = useElementRef(rootRef, mirrorStateAttributes);
	const setViewportElement = useElementRef(viewportRef, mirrorStateAttributes);

	const setContentElement = React.useCallback(
		(element: HTMLDivElement | null) => {
			contentRef.current = element;
		},
		[contentRef],
	);

	const setSpacerElement = React.useCallback(
		(element: HTMLDivElement | null) => {
			spacerRef.current = element;
			spacerGapRef.current = getFlexGap(element?.parentElement ?? null);
		},
		[spacerGapRef, spacerRef],
	);

	const syncAfterScroll = React.useCallback(
		({ userIntent = false }: { userIntent?: boolean } = {}) => {
			if (userIntent) {
				userScrollIntent();
			}

			commitScrollState();

			if (modeRef.current === "anchored-to-message" || modeRef.current === "settling-jump") {
				return;
			}

			capturePrependAnchor();
		},
		[capturePrependAnchor, commitScrollState, modeRef, userScrollIntent],
	);

	const context = React.useMemo<MessageScrollerContextValue>(
		() => ({
			handleContentChange,
			handleResize,
			preserveScrollOnPrependRef,
			scrollToEnd,
			scrollToStart,
			setContentElement,
			setRootElement,
			setSpacerElement,
			setViewportElement,
			stateStore,
			syncAfterScroll,
			userScrollIntent,
			viewportRef,
		}),
		[
			handleContentChange,
			handleResize,
			scrollToEnd,
			scrollToStart,
			setContentElement,
			setRootElement,
			setSpacerElement,
			setViewportElement,
			stateStore,
			syncAfterScroll,
			userScrollIntent,
			preserveScrollOnPrependRef,
			viewportRef,
		],
	);

	React.useLayoutEffect(() => {
		applyDefaultScrollPosition();
	}, [applyDefaultScrollPosition]);

	React.useEffect(() => {
		return () => {
			// Reset every ref after cancelling. StrictMode replays effects on the same
			// refs (unmount then remount), so a frame id left non-null here makes the
			// scheduler on remount think a frame is still pending and never reschedule.
			if (stateFrameRef.current !== null) {
				window.cancelAnimationFrame(stateFrameRef.current);
				stateFrameRef.current = null;
			}

			if (autoscrollingTimeoutRef.current !== null) {
				window.clearTimeout(autoscrollingTimeoutRef.current);
				autoscrollingTimeoutRef.current = null;
			}
		};
	}, [autoscrollingTimeoutRef, stateFrameRef]);

	React.useLayoutEffect(() => {
		if (autoScroll && modeRef.current === "following-bottom" && itemCountRef.current > 0) {
			scrollToEnd({ behavior: "auto" });
			return;
		}

		commitScrollState();
	}, [autoScroll, commitScrollState, itemCountRef, modeRef, scrollToEnd]);

	return {
		context,
	};
}

export { useMessageScrollerController };
