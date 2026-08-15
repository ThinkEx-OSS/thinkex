import { SCROLL_EDGE_THRESHOLD } from "./types";

// Whether content is still hidden below the viewport. Measured from the rows
// rather than scrollHeight so the tail spacer does not read as content.
function canScrollToEnd({
	content,
	spacer,
	viewport,
}: {
	content: HTMLElement | null;
	spacer: HTMLElement | null;
	viewport: HTMLElement | null;
}) {
	if (!viewport || !content) {
		return false;
	}

	const contentBottom = getContentBottom({ content, spacer, viewport });

	return contentBottom - viewport.scrollTop - viewport.clientHeight > SCROLL_EDGE_THRESHOLD;
}

function getMessageScrollerItems(content: HTMLElement, spacer: HTMLElement | null) {
	return Array.from(content.children).filter(
		(child): child is HTMLElement => child instanceof HTMLElement && child !== spacer,
	);
}

function getLastScrollAnchor(items: HTMLElement[]) {
	for (let index = items.length - 1; index >= 0; index--) {
		const item = items[index];

		if (item?.dataset.scrollAnchor === "true") {
			return item;
		}
	}

	return null;
}

// ponytail: linear scan from the top of the transcript. Costs one rect read per
// row above the reader, so it is at its worst parked at the bottom of a long
// thread. Index the rows if that ever shows up in a profile.
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

	for (const item of getMessageScrollerItems(content, spacer)) {
		if (!item.dataset.messageId) {
			continue;
		}

		const rect = item.getBoundingClientRect();

		if (rect.bottom > viewportRect.top && rect.top < viewportRect.bottom) {
			return item;
		}
	}

	return null;
}

// scrollTop that puts a row at the top of the viewport, less the peek that keeps
// the tail of the previous row in view.
function getRowScrollTop({
	content,
	element,
	peek,
	viewport,
}: {
	content: HTMLElement;
	element: HTMLElement;
	peek: number;
	viewport: HTMLElement;
}) {
	const elementRect = element.getBoundingClientRect();
	const viewportRect = viewport.getBoundingClientRect();
	const elementTop = elementRect.top - viewportRect.top + viewport.scrollTop;

	return elementTop - getBlockPadding(content).start - peek;
}

function getElementViewportTop(element: HTMLElement, viewport: HTMLElement) {
	return element.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
}

// Height the tail spacer needs so the row placed at scrollTop can sit at the top
// of the viewport with nothing below it to scroll into.
function getTailSpacerHeight({
	content,
	scrollTop,
	spacer,
	viewport,
}: {
	content: HTMLElement;
	scrollTop: number;
	spacer: HTMLElement | null;
	viewport: HTMLElement;
}) {
	return scrollTop + viewport.clientHeight - getContentBottom({ content, spacer, viewport });
}

// Where the rows end, ignoring the tail spacer. The rows are a flex column, so
// the last one is the lowest — no need to measure the rest.
function getContentBottom({
	content,
	spacer,
	viewport,
}: {
	content: HTMLElement;
	spacer: HTMLElement | null;
	viewport: HTMLElement;
}) {
	const items = getMessageScrollerItems(content, spacer);
	const padding = getBlockPadding(content);
	const lastItem = items[items.length - 1];

	if (!lastItem) {
		return padding.start + padding.end;
	}

	const bottom =
		lastItem.getBoundingClientRect().bottom -
		viewport.getBoundingClientRect().top +
		viewport.scrollTop +
		padding.end;

	return Math.max(bottom, padding.start + padding.end);
}

function getMaxScrollTop(viewport: HTMLElement) {
	return Math.max(0, viewport.scrollHeight - viewport.clientHeight);
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
	const gap = style.rowGap === "normal" ? style.gap : style.rowGap;

	return readCssPixel(gap);
}

function readCssPixel(value: string | undefined) {
	if (!value) {
		return 0;
	}

	const number = Number.parseFloat(value);

	return Number.isFinite(number) ? number : 0;
}

export {
	canScrollToEnd,
	getElementViewportTop,
	getFirstVisibleMessageItem,
	getFlexGap,
	getLastScrollAnchor,
	getMaxScrollTop,
	getMessageScrollerItems,
	getRowScrollTop,
	getTailSpacerHeight,
};
