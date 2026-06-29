export type ClientPoint = {
	x: number;
	y: number;
};

export type SelectionRect = Pick<DOMRectReadOnly, "height" | "left" | "top" | "width">;

export function getPointerClientPoint(
	event: Pick<PointerEvent, "clientX" | "clientY">,
): ClientPoint {
	return {
		x: event.clientX,
		y: event.clientY,
	};
}

export function getRangeClientRect(range: Range, point?: ClientPoint | null): DOMRect | null {
	const rects = Array.from(range.getClientRects()).filter(hasArea);

	if (point && rects.length > 0) {
		return rects.reduce((closest, rect) =>
			getPointDistanceToRect(point, rect) < getPointDistanceToRect(point, closest) ? rect : closest,
		);
	}

	const rect = range.getBoundingClientRect();

	if (hasArea(rect)) {
		return rect;
	}

	return rects[0] ?? null;
}

export function getBottomPreferredSelectionMenuPlacement({
	menu,
	point,
	rect,
	viewport,
}: {
	menu: {
		height: number;
		offset: number;
		viewportMargin: number;
		width: number;
	};
	point?: ClientPoint | null;
	rect: SelectionRect;
	viewport: {
		height: number;
		width: number;
	};
}) {
	const minCenterX = menu.viewportMargin + menu.width / 2;
	const maxCenterX = viewport.width - menu.viewportMargin - menu.width / 2;
	const referenceX = point
		? clamp(point.x, rect.left, rect.left + rect.width)
		: rect.left + rect.width / 2;
	const aboveTop = rect.top - menu.offset - menu.height;
	const belowTop = rect.top + rect.height + menu.offset;
	const canPlaceAbove = aboveTop >= menu.viewportMargin;
	const canPlaceBelow = belowTop + menu.height <= viewport.height - menu.viewportMargin;
	const top = canPlaceBelow || !canPlaceAbove ? belowTop : aboveTop;

	return {
		left: clamp(referenceX, minCenterX, maxCenterX),
		top: clamp(top, menu.viewportMargin, viewport.height - menu.viewportMargin - menu.height),
	};
}

export function clamp(value: number, min: number, max: number) {
	if (max < min) {
		return min;
	}

	return Math.min(Math.max(value, min), max);
}

function hasArea(rect: DOMRectReadOnly) {
	return rect.width > 0 || rect.height > 0;
}

function getPointDistanceToRect(point: ClientPoint, rect: DOMRectReadOnly) {
	const dx =
		point.x < rect.left ? rect.left - point.x : point.x > rect.right ? point.x - rect.right : 0;
	const dy =
		point.y < rect.top ? rect.top - point.y : point.y > rect.bottom ? point.y - rect.bottom : 0;

	return dx * dx + dy * dy;
}
