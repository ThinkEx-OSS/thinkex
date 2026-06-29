import * as React from "react";

import { USER_SCROLL_KEYS } from "./types";
import type {
	MessageScrollerButtonProps,
	MessageScrollerContentProps,
	MessageScrollerContextValue,
	MessageScrollerItemProps,
	MessageScrollerProps,
	MessageScrollerProviderProps,
	MessageScrollerViewportProps,
} from "./types";
import { useMessageScrollerController } from "./use-message-scroller-controller";
import { composeRefs, useLatest } from "./utils";

const MessageScrollerContext = React.createContext<MessageScrollerContextValue | null>(null);

function useMessageScrollerContext() {
	const context = React.useContext(MessageScrollerContext);

	if (!context) {
		throw new Error("MessageScroller parts must be used within MessageScrollerProvider.");
	}

	return context;
}

function MessageScrollerProvider({
	appendedAnchorScrollBehavior,
	autoScroll = false,
	children,
	defaultScrollPosition = "end",
	scrollEdgeThreshold,
	scrollPreviousItemPeek,
	scrollMargin,
}: MessageScrollerProviderProps) {
	const { context } = useMessageScrollerController({
		appendedAnchorScrollBehavior,
		autoScroll,
		defaultScrollPosition,
		scrollEdgeThreshold,
		scrollPreviousItemPeek,
		scrollMargin,
	});

	return (
		<MessageScrollerContext.Provider value={context}>{children}</MessageScrollerContext.Provider>
	);
}

function MessageScroller({ children, ref, ...props }: MessageScrollerProps) {
	const { setRootElement } = useMessageScrollerContext();
	const setRootRef = React.useCallback(
		(element: HTMLDivElement | null) => {
			setRootElement(element);
			composeRefs(ref)?.(element);
		},
		[ref, setRootElement],
	);

	return (
		<div {...props} ref={setRootRef}>
			{children}
		</div>
	);
}

function MessageScrollerViewport({
	"aria-label": ariaLabel,
	children,
	onKeyDown,
	onPointerDown,
	onScroll,
	onTouchMove,
	onWheel,
	preserveScrollOnPrepend = true,
	ref,
	role,
	tabIndex,
	...props
}: MessageScrollerViewportProps) {
	const {
		handleResize,
		preserveScrollOnPrependRef,
		setViewportElement,
		syncAfterScroll,
		userScrollIntent,
		viewportRef,
	} = useMessageScrollerContext();
	const pointerScrollIntentRef = React.useRef(false);

	React.useLayoutEffect(() => {
		preserveScrollOnPrependRef.current = preserveScrollOnPrepend;
	}, [preserveScrollOnPrepend, preserveScrollOnPrependRef]);

	const setViewportRef = React.useCallback(
		(element: HTMLDivElement | null) => {
			setViewportElement(element);
			composeRefs(ref)?.(element);
		},
		[ref, setViewportElement],
	);

	function handleScroll(event: React.UIEvent<HTMLDivElement>) {
		syncAfterScroll({ userIntent: pointerScrollIntentRef.current });
		onScroll?.(event);
	}

	function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
		pointerScrollIntentRef.current = true;

		function clearPointerScrollIntent() {
			pointerScrollIntentRef.current = false;
			window.removeEventListener("pointerup", clearPointerScrollIntent);
			window.removeEventListener("pointercancel", clearPointerScrollIntent);
		}

		window.addEventListener("pointerup", clearPointerScrollIntent);
		window.addEventListener("pointercancel", clearPointerScrollIntent);
		onPointerDown?.(event);
	}

	function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
		userScrollIntent();
		onWheel?.(event);
	}

	function handleTouchMove(event: React.TouchEvent<HTMLDivElement>) {
		userScrollIntent();
		onTouchMove?.(event);
	}

	function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
		if (USER_SCROLL_KEYS.has(event.key)) {
			userScrollIntent();
		}

		onKeyDown?.(event);
	}

	React.useEffect(() => {
		const viewport = viewportRef.current;

		if (!viewport || typeof ResizeObserver === "undefined") {
			return;
		}

		const observer = new ResizeObserver(handleResize);

		observer.observe(viewport);

		return () => observer.disconnect();
	}, [handleResize, viewportRef]);

	return (
		<div
			ref={setViewportRef}
			role={role ?? "region"}
			aria-label={ariaLabel ?? "Messages"}
			tabIndex={tabIndex ?? 0}
			onKeyDown={handleKeyDown}
			onPointerDown={handlePointerDown}
			onScroll={handleScroll}
			onTouchMove={handleTouchMove}
			onWheel={handleWheel}
			{...props}
		>
			{children}
		</div>
	);
}

function MessageScrollerContent({
	"aria-relevant": ariaRelevant,
	children,
	ref,
	role,
	spacerClassName,
	...props
}: MessageScrollerContentProps) {
	const { handleContentChange, handleResize, setContentElement, setSpacerElement } =
		useMessageScrollerContext();
	const contentRef = React.useRef<HTMLDivElement | null>(null);

	const setContentRef = React.useCallback(
		(element: HTMLDivElement | null) => {
			contentRef.current = element;
			setContentElement(element);
			composeRefs(ref)?.(element);
		},
		[ref, setContentElement],
	);

	React.useLayoutEffect(() => {
		const content = contentRef.current;

		if (!content) {
			return;
		}

		handleContentChange();

		if (typeof MutationObserver === "undefined") {
			return;
		}

		const observer = new MutationObserver(() => {
			handleContentChange();
		});

		observer.observe(content, { childList: true });

		return () => observer.disconnect();
	}, [handleContentChange]);

	React.useEffect(() => {
		const content = contentRef.current;

		if (!content || typeof ResizeObserver === "undefined") {
			return;
		}

		const observer = new ResizeObserver(handleResize);

		observer.observe(content);

		return () => observer.disconnect();
	}, [handleResize]);

	return (
		<div
			ref={setContentRef}
			role={role ?? "log"}
			aria-relevant={ariaRelevant ?? "additions"}
			{...props}
		>
			{children}
			<div
				ref={setSpacerElement}
				aria-hidden="true"
				data-message-scroller-spacer=""
				hidden
				className={spacerClassName}
			/>
		</div>
	);
}

function MessageScrollerItem({
	messageId,
	ref,
	scrollAnchor = false,
	...props
}: MessageScrollerItemProps) {
	return (
		<div
			{...props}
			ref={ref}
			data-message-id={messageId}
			data-scroll-anchor={scrollAnchor ? "true" : "false"}
		/>
	);
}

function MessageScrollerButton({
	behavior = "smooth",
	children,
	direction = "end",
	onClick,
	tabIndex,
	type = "button",
	...props
}: MessageScrollerButtonProps) {
	const { scrollToEnd, scrollToStart, stateStore } = useMessageScrollerContext();
	const onClickRef = useLatest(onClick);
	const subscribe = React.useCallback(
		(listener: () => void) => stateStore.subscribe(listener),
		[stateStore],
	);
	const getSnapshot = React.useCallback(() => {
		const state = stateStore.getSnapshot();

		return direction === "start" ? state.start : state.end;
	}, [direction, stateStore]);
	const isActive = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

	const handleClick = React.useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			if (!isActive) {
				return;
			}

			onClickRef.current?.(event);

			if (!event.defaultPrevented) {
				event.currentTarget.blur();

				if (direction === "start") {
					scrollToStart({ behavior });
				} else {
					scrollToEnd({ behavior });
				}
			}
		},
		[behavior, direction, isActive, onClickRef, scrollToEnd, scrollToStart],
	);

	return (
		<button
			{...props}
			type={type}
			inert={!isActive}
			tabIndex={isActive ? tabIndex : -1}
			data-active={isActive ? "true" : "false"}
			data-direction={direction}
			onClick={handleClick}
		>
			{children ?? <span>Scroll to {direction}</span>}
		</button>
	);
}

export {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
};
