import * as React from "react";

// Distance from an edge that still counts as at-bottom. Sub-pixel tolerance so
// edge detection does not flicker across engines that round scrollTop differently.
const SCROLL_EDGE_THRESHOLD = 8;

// Default scrollPreviousItemPeek. Pixels of the previous item kept visible above
// a newly anchored row.
const DEFAULT_SCROLL_PREVIOUS_ITEM_PEEK = 64;

// Two fractional scrollTop values within this range are treated as equal, to
// absorb zoom and HiDPI rounding drift.
const SCROLL_POSITION_EPSILON = 0.5;

// How long (ms) data-autoscrolling stays set during a programmatic smooth scroll
// before clearing.
const AUTOSCROLLING_CLEAR_DELAY = 180;

// Viewport keys that count as deliberate scroll intent and release the anchor.
const USER_SCROLL_KEYS = new Set([
	"ArrowDown",
	"ArrowUp",
	"End",
	"Home",
	"PageDown",
	"PageUp",
	" ", // Space key.
]);

// Headless provider for a chat transcript scroller. Owns scroll behavior and
// state; renders no DOM.
type MessageScrollerProviderProps = {
	children?: React.ReactNode;
	// Scroll behavior for newly appended anchor rows. Initial restore stays instant.
	appendedAnchorScrollBehavior?: ScrollBehavior;
	// Top margin for a newly anchored row, sized to keep this much of the previous
	// row visible above it. Defaults to 64.
	scrollPreviousItemPeek?: number;
};

// Frame container for a chat transcript scroller. Must render inside a
// MessageScrollerProvider.
type MessageScrollerProps = React.ComponentProps<"div">;

// Scrollable viewport. Owns native scroll events and scroll intent.
type MessageScrollerViewportProps = React.ComponentProps<"div">;

// Transcript row container. Every direct child should be a MessageScrollerItem.
type MessageScrollerContentProps = React.ComponentProps<"div"> & {
	// Class name for the internal tail spacer used when anchoring turns near the top.
	spacerClassName?: string;
};

// One transcript row: a message, marker, typing row, separator, or load-more row.
type MessageScrollerItemProps = React.ComponentProps<"div"> & {
	// Stable row id. Marks a row as a candidate for the reading anchor.
	messageId?: string;
	// Marks a turn boundary that newly appended anchors and the opening restore use.
	scrollAnchor?: boolean;
};

// Scroll-to-end control.
type MessageScrollerButtonProps = React.ComponentProps<"button"> & {
	// Native scroll behavior when clicked. Defaults to "smooth".
	behavior?: ScrollBehavior;
};

// Internal context wiring the parts together. Not part of the public API.
type MessageScrollerContextValue = {
	handleContentChange: () => void;
	handleResize: () => void;
	scrollToEnd: (options?: { behavior?: ScrollBehavior }) => boolean;
	setContentElement: (element: HTMLDivElement | null) => void;
	setSpacerElement: (element: HTMLDivElement | null) => void;
	setViewportElement: (element: HTMLDivElement | null) => void;
	subscribeCanScrollToEnd: (listener: () => void) => () => void;
	getCanScrollToEnd: () => boolean;
	syncAfterScroll: (options?: { userIntent?: boolean }) => void;
	userScrollIntent: () => void;
	viewportRef: React.RefObject<HTMLDivElement | null>;
};

export {
	AUTOSCROLLING_CLEAR_DELAY,
	DEFAULT_SCROLL_PREVIOUS_ITEM_PEEK,
	SCROLL_EDGE_THRESHOLD,
	SCROLL_POSITION_EPSILON,
	USER_SCROLL_KEYS,
};

export type {
	MessageScrollerButtonProps,
	MessageScrollerContentProps,
	MessageScrollerContextValue,
	MessageScrollerItemProps,
	MessageScrollerProps,
	MessageScrollerProviderProps,
	MessageScrollerViewportProps,
};
