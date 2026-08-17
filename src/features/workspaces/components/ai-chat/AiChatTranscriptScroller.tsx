import { ArrowDownIcon } from "lucide-react";
import * as React from "react";

import { buttonVariants } from "#/components/ui/button";
import { aiChatMessageScrollerContentClassName } from "#/features/workspaces/components/ai-chat/ai-chat-layout";
import { cn } from "#/lib/utils";

const SCROLL_EDGE_THRESHOLD = 8;
const SCROLL_PREVIOUS_ITEM_PEEK = 40;
const SCROLL_SETTLE_FALLBACK_MS = 200;
const USER_SCROLL_KEYS = new Set([
	"ArrowDown",
	"ArrowUp",
	"End",
	"Home",
	"PageDown",
	"PageUp",
	" ",
]);

type TranscriptPosition =
	| { readonly kind: "anchored"; readonly messageId: string }
	| {
			readonly kind: "settling";
			readonly messageId: string;
	  }
	| { readonly kind: "free" };

interface AiChatTranscriptScrollerProps {
	anchorMessageId: string | undefined;
	busy: boolean;
	children: React.ReactNode;
	initialAnchorMessageId?: string;
	reduceMotion: boolean;
	smoothAnchorMessageId?: string;
}

/**
 * Owns transcript scrolling, turn anchoring, resize reconciliation, and the
 * scroll-to-end affordance behind one chat-specific interface.
 */
export function AiChatTranscriptScroller({
	anchorMessageId,
	busy,
	children,
	initialAnchorMessageId,
	reduceMotion,
	smoothAnchorMessageId,
}: AiChatTranscriptScrollerProps) {
	const contentRef = React.useRef<HTMLDivElement | null>(null);
	const spacerRef = React.useRef<HTMLDivElement | null>(null);
	const viewportRef = React.useRef<HTMLDivElement | null>(null);
	const appliedAnchorIdRef = React.useRef<string | undefined>(undefined);
	const appliedInitialAnchorRef = React.useRef(false);
	const contentPaddingRef = React.useRef({ end: 0, start: 0 });
	const pointerIntentAbortRef = React.useRef<AbortController | null>(null);
	const pointerScrollIntentRef = React.useRef(false);
	const positionRef = React.useRef<TranscriptPosition>({ kind: "free" });
	const readingAnchorRef = React.useRef<{
		element: HTMLElement;
		viewportTop: number;
	} | null>(null);
	const settleTimeoutRef = React.useRef<number | null>(null);
	const spacerGapRef = React.useRef(0);
	const spacerHeightRef = React.useRef(0);
	const [canScrollToEnd, setCanScrollToEnd] = React.useState(false);
	const setContentRef = React.useCallback((element: HTMLDivElement | null) => {
		contentRef.current = element;
		spacerGapRef.current = getFlexGap(element);
		contentPaddingRef.current = element ? getBlockPadding(element) : { end: 0, start: 0 };
	}, []);
	const refreshContentMetrics = React.useCallback(() => {
		const content = contentRef.current;
		spacerGapRef.current = getFlexGap(content);
		contentPaddingRef.current = content ? getBlockPadding(content) : { end: 0, start: 0 };
	}, []);

	const commitScrollState = React.useCallback(() => {
		const content = contentRef.current;
		const spacer = spacerRef.current;
		const viewport = viewportRef.current;

		if (!content || !viewport) {
			setCanScrollToEnd(false);
			return;
		}

		const contentBottom = getContentBottom({
			content,
			padding: contentPaddingRef.current,
			spacer,
			viewport,
		});
		setCanScrollToEnd(
			contentBottom - viewport.scrollTop - viewport.clientHeight > SCROLL_EDGE_THRESHOLD,
		);
	}, []);

	const setTailSpacerHeight = React.useCallback((height: number) => {
		const spacer = spacerRef.current;
		const nextHeight = Math.max(0, Math.ceil(height));

		if (!spacer) {
			return;
		}

		if (spacerHeightRef.current !== nextHeight) {
			spacerHeightRef.current = nextHeight;
			spacer.hidden = nextHeight === 0;
			spacer.style.height = `${nextHeight}px`;
		}
		spacer.style.marginTop = nextHeight > 0 ? `${-spacerGapRef.current}px` : "";
	}, []);

	const prepareAnchor = React.useCallback(
		(messageId: string) => {
			const content = contentRef.current;
			const spacer = spacerRef.current;
			const viewport = viewportRef.current;

			if (!content || !viewport) {
				return undefined;
			}

			const item = getMessageItem(content, messageId);
			if (!item) {
				return undefined;
			}

			const padding = contentPaddingRef.current;
			const scrollTop = getAnchorScrollTop({ item, padding, viewport });
			setTailSpacerHeight(
				scrollTop +
					viewport.clientHeight -
					getContentBottom({ content, padding, spacer, viewport }),
			);
			return Math.max(0, scrollTop);
		},
		[setTailSpacerHeight],
	);

	const placeAnchor = React.useCallback(
		(messageId: string) => {
			const viewport = viewportRef.current;
			const scrollTop = prepareAnchor(messageId);
			if (!viewport || scrollTop === undefined) {
				return false;
			}

			viewport.scrollTop = scrollTop;
			commitScrollState();
			return true;
		},
		[commitScrollState, prepareAnchor],
	);
	const clearSettleFallback = React.useCallback(() => {
		if (settleTimeoutRef.current !== null) {
			window.clearTimeout(settleTimeoutRef.current);
			settleTimeoutRef.current = null;
		}
	}, []);
	const finishSettling = React.useCallback(
		(messageId: string) => {
			const position = positionRef.current;
			if (position.kind !== "settling" || position.messageId !== messageId) {
				return;
			}

			clearSettleFallback();
			positionRef.current = { kind: "anchored", messageId };
			placeAnchor(messageId);
		},
		[clearSettleFallback, placeAnchor],
	);
	const scheduleSettleFallback = React.useCallback(
		(messageId: string) => {
			clearSettleFallback();
			settleTimeoutRef.current = window.setTimeout(
				() => finishSettling(messageId),
				SCROLL_SETTLE_FALLBACK_MS,
			);
		},
		[clearSettleFallback, finishSettling],
	);

	const settleAnchor = React.useCallback(
		(messageId: string) => {
			const viewport = viewportRef.current;
			const targetScrollTop = prepareAnchor(messageId);
			if (!viewport || targetScrollTop === undefined) {
				return false;
			}

			if (reduceMotion) {
				positionRef.current = { kind: "anchored", messageId };
				viewport.scrollTo({ behavior: "auto", top: targetScrollTop });
				commitScrollState();
				return true;
			}

			positionRef.current = { kind: "settling", messageId };
			viewport.scrollTo({ behavior: "smooth", top: targetScrollTop });
			scheduleSettleFallback(messageId);
			commitScrollState();
			return true;
		},
		[commitScrollState, prepareAnchor, reduceMotion, scheduleSettleFallback],
	);
	const captureReadingAnchor = React.useCallback(() => {
		const content = contentRef.current;
		const viewport = viewportRef.current;
		if (!content || !viewport) {
			readingAnchorRef.current = null;
			return;
		}

		const element = getFirstVisibleMessageItem({
			content,
			spacer: spacerRef.current,
			viewport,
		});
		readingAnchorRef.current = element
			? { element, viewportTop: getElementViewportTop(element, viewport) }
			: null;
	}, []);
	const restoreReadingAnchor = React.useCallback(() => {
		const anchor = readingAnchorRef.current;
		const viewport = viewportRef.current;
		if (!anchor || !viewport || !anchor.element.isConnected) {
			return false;
		}

		const delta = getElementViewportTop(anchor.element, viewport) - anchor.viewportTop;
		if (Math.abs(delta) <= 0.5) {
			return false;
		}

		viewport.scrollTop += delta;
		anchor.viewportTop = getElementViewportTop(anchor.element, viewport);
		commitScrollState();
		return true;
	}, [commitScrollState]);

	const reconcileLayout = React.useCallback(() => {
		refreshContentMetrics();
		const position = positionRef.current;

		if (position.kind === "anchored" && placeAnchor(position.messageId)) {
			return;
		}
		if (position.kind === "settling") {
			if (prepareAnchor(position.messageId) !== undefined) {
				commitScrollState();
				return;
			}
		}
		if (position.kind === "free" && restoreReadingAnchor()) {
			return;
		}

		commitScrollState();
	}, [commitScrollState, placeAnchor, prepareAnchor, refreshContentMetrics, restoreReadingAnchor]);

	// Apply explicit anchor transitions in the same commit. ResizeObserver owns
	// geometry changes from streaming content, images, and viewport resizing.
	React.useLayoutEffect(() => {
		if (!anchorMessageId && appliedAnchorIdRef.current !== undefined) {
			appliedAnchorIdRef.current = undefined;
			clearSettleFallback();
			positionRef.current = { kind: "free" };
			captureReadingAnchor();
			return;
		}
		if (anchorMessageId && anchorMessageId !== appliedAnchorIdRef.current) {
			refreshContentMetrics();
			appliedAnchorIdRef.current = anchorMessageId;
			appliedInitialAnchorRef.current = true;
			readingAnchorRef.current = null;
			if (anchorMessageId === smoothAnchorMessageId && settleAnchor(anchorMessageId)) {
				return;
			}

			positionRef.current = { kind: "anchored", messageId: anchorMessageId };
			placeAnchor(anchorMessageId);
			return;
		}
		if (!appliedInitialAnchorRef.current && initialAnchorMessageId) {
			refreshContentMetrics();
			if (placeAnchor(initialAnchorMessageId)) {
				appliedInitialAnchorRef.current = true;
				positionRef.current = { kind: "anchored", messageId: initialAnchorMessageId };
				readingAnchorRef.current = null;
			}
		}
	}, [
		anchorMessageId,
		captureReadingAnchor,
		clearSettleFallback,
		initialAnchorMessageId,
		placeAnchor,
		refreshContentMetrics,
		settleAnchor,
		smoothAnchorMessageId,
	]);

	React.useEffect(() => {
		const content = contentRef.current;
		const viewport = viewportRef.current;
		if (!content || !viewport || typeof ResizeObserver === "undefined") {
			return;
		}

		const observer = new ResizeObserver(reconcileLayout);
		observer.observe(content);
		observer.observe(viewport);

		return () => observer.disconnect();
	}, [reconcileLayout]);

	const clearPointerScrollIntent = React.useCallback(() => {
		pointerIntentAbortRef.current?.abort();
		pointerIntentAbortRef.current = null;
		pointerScrollIntentRef.current = false;
	}, []);

	React.useEffect(
		() => () => {
			clearPointerScrollIntent();
			clearSettleFallback();
		},
		[clearPointerScrollIntent, clearSettleFallback],
	);

	const releaseAnchor = React.useCallback(() => {
		const position = positionRef.current;
		if (position.kind !== "anchored" && position.kind !== "settling") {
			return;
		}

		clearSettleFallback();
		positionRef.current = { kind: "free" };
		captureReadingAnchor();
		if (position.kind === "settling" && viewportRef.current) {
			viewportRef.current.scrollTo({ behavior: "auto", top: viewportRef.current.scrollTop });
		}
	}, [captureReadingAnchor, clearSettleFallback]);

	const handleScroll = () => {
		if (pointerScrollIntentRef.current) {
			releaseAnchor();
		}
		const position = positionRef.current;
		if (position.kind === "settling") {
			scheduleSettleFallback(position.messageId);
		}

		commitScrollState();
		if (positionRef.current.kind === "free") {
			captureReadingAnchor();
		}
	};

	const handleScrollEnd = () => {
		const position = positionRef.current;
		if (position.kind !== "settling") {
			return;
		}

		finishSettling(position.messageId);
	};

	const handlePointerDown = () => {
		clearPointerScrollIntent();
		pointerScrollIntentRef.current = true;
		const controller = new AbortController();
		pointerIntentAbortRef.current = controller;

		const finishPointerScrollIntent = () => {
			if (pointerIntentAbortRef.current !== controller) {
				return;
			}

			pointerScrollIntentRef.current = false;
			pointerIntentAbortRef.current = null;
			controller.abort();
		};

		window.addEventListener("pointerup", finishPointerScrollIntent, { signal: controller.signal });
		window.addEventListener("pointercancel", finishPointerScrollIntent, {
			signal: controller.signal,
		});
	};

	const scrollToEnd = () => {
		const viewport = viewportRef.current;
		if (!viewport) {
			return;
		}

		setTailSpacerHeight(0);
		positionRef.current = { kind: "free" };
		readingAnchorRef.current = null;
		viewport.scrollTo({
			behavior: reduceMotion ? "auto" : "smooth",
			top: Math.max(0, viewport.scrollHeight - viewport.clientHeight),
		});
		commitScrollState();
	};

	return (
		<div className="group/ai-chat-scroller relative flex size-full min-h-0 flex-col overflow-hidden">
			<div
				ref={viewportRef}
				role="region"
				aria-label="Messages"
				tabIndex={0}
				className="size-full min-h-0 min-w-0 scroll-fade scrollbar-thin scrollbar-gutter-stable overflow-y-auto overscroll-contain contain-content [overflow-anchor:none]"
				onKeyDown={(event) => {
					if (USER_SCROLL_KEYS.has(event.key)) {
						releaseAnchor();
					}
				}}
				onPointerDown={handlePointerDown}
				onScroll={handleScroll}
				onScrollEnd={handleScrollEnd}
				onTouchMove={releaseAnchor}
				onWheel={releaseAnchor}
			>
				<div
					ref={setContentRef}
					role="log"
					aria-busy={busy}
					aria-relevant="additions"
					className={cn("flex h-max min-h-full flex-col", aiChatMessageScrollerContentClassName)}
				>
					{children}
					<div ref={spacerRef} aria-hidden="true" data-ai-chat-tail-spacer="" hidden />
				</div>
			</div>
			<button
				type="button"
				inert={!canScrollToEnd}
				tabIndex={canScrollToEnd ? 0 : -1}
				data-active={canScrollToEnd ? "true" : "false"}
				className={cn(
					buttonVariants({ size: "icon-sm", variant: "secondary" }),
					"absolute bottom-3 start-1/2 -translate-x-1/2 border-border bg-background text-foreground shadow-sm transition-[translate,scale,opacity] duration-200 hover:bg-muted hover:text-foreground data-[active=false]:pointer-events-none data-[active=false]:translate-y-full data-[active=false]:scale-95 data-[active=false]:opacity-0 data-[active=false]:duration-400 data-[active=false]:ease-[cubic-bezier(0.7,0,0.84,0)] data-[active=true]:translate-y-0 data-[active=true]:scale-100 data-[active=true]:opacity-100 data-[active=true]:ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none rtl:translate-x-1/2",
				)}
				onClick={(event) => {
					event.currentTarget.blur();
					scrollToEnd();
				}}
			>
				<ArrowDownIcon />
				<span className="sr-only">Scroll to end</span>
			</button>
		</div>
	);
}

/** A stable transcript row addressed by message id. */
export function AiChatTranscriptItem({
	children,
	messageId,
}: {
	children: React.ReactNode;
	messageId: string;
}) {
	return (
		<div data-ai-chat-message-id={messageId} className="min-w-0 shrink-0">
			{children}
		</div>
	);
}

function getMessageItem(content: HTMLElement, messageId: string) {
	for (let index = content.children.length - 1; index >= 0; index -= 1) {
		const child = content.children.item(index);
		if (child instanceof HTMLElement && child.dataset.aiChatMessageId === messageId) {
			return child;
		}
	}

	return undefined;
}

function getFirstVisibleMessageItem({
	content,
	spacer,
	viewport,
}: {
	content: HTMLElement;
	spacer: HTMLElement | null;
	viewport: HTMLElement;
}) {
	const viewportRect = viewport.getBoundingClientRect();
	let low = 0;
	let high = content.children.length - (spacer ? 2 : 1);
	let firstVisible: HTMLElement | null = null;

	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const child = content.children.item(middle);
		if (!(child instanceof HTMLElement)) {
			break;
		}

		if (child.getBoundingClientRect().bottom > viewportRect.top) {
			firstVisible = child;
			high = middle - 1;
		} else {
			low = middle + 1;
		}
	}

	return firstVisible && firstVisible.getBoundingClientRect().top < viewportRect.bottom
		? firstVisible
		: null;
}

function getElementViewportTop(element: HTMLElement, viewport: HTMLElement) {
	return element.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
}

function getAnchorScrollTop({
	item,
	padding,
	viewport,
}: {
	item: HTMLElement;
	padding: { end: number; start: number };
	viewport: HTMLElement;
}) {
	const itemTop =
		item.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;

	return itemTop - padding.start - SCROLL_PREVIOUS_ITEM_PEEK;
}

function getContentBottom({
	content,
	padding,
	spacer,
	viewport,
}: {
	content: HTMLElement;
	padding: { end: number; start: number };
	spacer: HTMLElement | null;
	viewport: HTMLElement;
}) {
	const lastItem = spacer?.previousElementSibling ?? content.lastElementChild;

	if (!(lastItem instanceof HTMLElement)) {
		return padding.start + padding.end;
	}

	return Math.max(
		lastItem.getBoundingClientRect().bottom -
			viewport.getBoundingClientRect().top +
			viewport.scrollTop +
			padding.end,
		padding.start + padding.end,
	);
}

function getBlockPadding(element: HTMLElement) {
	const style = window.getComputedStyle(element);
	return {
		end: readCssPixel(style.paddingBlockEnd || style.paddingBottom),
		start: readCssPixel(style.paddingBlockStart || style.paddingTop),
	};
}

function getFlexGap(element: HTMLElement | null) {
	if (!element) {
		return 0;
	}

	const style = window.getComputedStyle(element);
	return readCssPixel(style.rowGap === "normal" ? style.gap : style.rowGap);
}

function readCssPixel(value: string | undefined) {
	const number = Number.parseFloat(value ?? "");
	return Number.isFinite(number) ? number : 0;
}
