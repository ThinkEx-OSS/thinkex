export const WORKSPACE_CAPTURE_MIN_SIZE = 8;
/** Multiplier on screen-space selection size before the max-side cap. */
export const WORKSPACE_CAPTURE_MAX_RENDER_SCALE = 1;
/** Longest edge of a capture attachment (chat snippets do not need full pane resolution). */
export const WORKSPACE_CAPTURE_MAX_OUTPUT_SIDE = 960;

export interface WorkspaceRegionRect {
	origin: { x: number; y: number };
	size: { height: number; width: number };
}

export function resolveCaptureOutputSize(
	screenWidth: number,
	screenHeight: number,
): { height: number; width: number } {
	const width = Math.max(1, Math.round(screenWidth * WORKSPACE_CAPTURE_MAX_RENDER_SCALE));
	const height = Math.max(1, Math.round(screenHeight * WORKSPACE_CAPTURE_MAX_RENDER_SCALE));
	const longestSide = Math.max(width, height);

	if (longestSide <= WORKSPACE_CAPTURE_MAX_OUTPUT_SIDE) {
		return { width, height };
	}

	const ratio = WORKSPACE_CAPTURE_MAX_OUTPUT_SIDE / longestSide;

	return {
		width: Math.max(1, Math.round(width * ratio)),
		height: Math.max(1, Math.round(height * ratio)),
	};
}

/** Scale factor to apply on top of display/page scale so output matches resolveCaptureOutputSize. */
export function captureOutputScaleFactor(screenWidth: number, screenHeight: number): number {
	if (screenWidth <= 0 || screenHeight <= 0) {
		return 1;
	}

	const { width, height } = resolveCaptureOutputSize(screenWidth, screenHeight);

	return Math.min(width / screenWidth, height / screenHeight);
}

export function createCaptureAttachmentFile({
	blob,
	fileName,
	suffix,
}: {
	blob: Blob;
	fileName: string;
	suffix: string;
}) {
	const stem = fileName.replace(/\.[^/.]+$/, "") || "file";

	return new File([blob], `${stem}-${suffix}.png`, {
		lastModified: Date.now(),
		type: blob.type || "image/png",
	});
}

export function getLocalPointerPosition(
	event: Pick<PointerEvent, "clientX" | "clientY">,
	element: HTMLElement,
) {
	const rect = element.getBoundingClientRect();

	return {
		x: clampNumber(event.clientX - rect.left, 0, rect.width),
		y: clampNumber(event.clientY - rect.top, 0, rect.height),
	};
}

export function regionRectFromTwoPoints(
	first: { x: number; y: number },
	second: { x: number; y: number },
): WorkspaceRegionRect {
	const left = Math.min(first.x, second.x);
	const top = Math.min(first.y, second.y);
	const right = Math.max(first.x, second.x);
	const bottom = Math.max(first.y, second.y);

	return {
		origin: { x: left, y: top },
		size: {
			height: bottom - top,
			width: right - left,
		},
	};
}

export function regionRectToClientRect(region: WorkspaceRegionRect, element: HTMLElement) {
	const bounds = element.getBoundingClientRect();

	return new DOMRect(
		bounds.left + region.origin.x,
		bounds.top + region.origin.y,
		region.size.width,
		region.size.height,
	);
}

export function isValidCaptureRegion(region: WorkspaceRegionRect) {
	return (
		region.size.width >= WORKSPACE_CAPTURE_MIN_SIZE &&
		region.size.height >= WORKSPACE_CAPTURE_MIN_SIZE
	);
}

export function clampNumber(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}
