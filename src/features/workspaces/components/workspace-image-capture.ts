import {
	regionRectToClientRect,
	resolveCaptureOutputSize,
	type WorkspaceRegionRect,
} from "#/features/workspaces/components/workspace-region-capture";

/** Visible image bounds when the element uses CSS `object-fit: contain`. */
export function getContainedImageClientRect(image: HTMLImageElement): DOMRect {
	const { naturalWidth, naturalHeight } = image;

	if (naturalWidth <= 0 || naturalHeight <= 0) {
		return image.getBoundingClientRect();
	}

	const elementRect = image.getBoundingClientRect();
	const containScale = Math.min(
		elementRect.width / naturalWidth,
		elementRect.height / naturalHeight,
	);
	const renderedWidth = naturalWidth * containScale;
	const renderedHeight = naturalHeight * containScale;

	return new DOMRect(
		elementRect.left + (elementRect.width - renderedWidth) / 2,
		elementRect.top + (elementRect.height - renderedHeight) / 2,
		renderedWidth,
		renderedHeight,
	);
}

export async function renderImageRegionCapture(
	image: HTMLImageElement,
	region: WorkspaceRegionRect,
	overlayElement: HTMLElement,
) {
	if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
		throw new Error("Image is not ready to capture.");
	}

	const selectionRect = regionRectToClientRect(region, overlayElement);
	const imageRect = getContainedImageClientRect(image);
	const left = Math.max(selectionRect.left, imageRect.left);
	const top = Math.max(selectionRect.top, imageRect.top);
	const right = Math.min(selectionRect.right, imageRect.right);
	const bottom = Math.min(selectionRect.bottom, imageRect.bottom);
	const width = right - left;
	const height = bottom - top;

	if (width <= 0 || height <= 0) {
		throw new Error("Capture region does not overlap the image.");
	}

	const sourceX = ((left - imageRect.left) / imageRect.width) * image.naturalWidth;
	const sourceY = ((top - imageRect.top) / imageRect.height) * image.naturalHeight;
	const sourceWidth = (width / imageRect.width) * image.naturalWidth;
	const sourceHeight = (height / imageRect.height) * image.naturalHeight;

	// Screen-resolution output, capped for fast chat attachments.
	const { width: outputWidth, height: outputHeight } = resolveCaptureOutputSize(width, height);

	const canvas = document.createElement("canvas");
	canvas.width = outputWidth;
	canvas.height = outputHeight;

	const context = canvas.getContext("2d");

	if (!context) {
		throw new Error("Canvas is unavailable.");
	}

	context.drawImage(
		image,
		sourceX,
		sourceY,
		sourceWidth,
		sourceHeight,
		0,
		0,
		outputWidth,
		outputHeight,
	);

	const blob = await new Promise<Blob | null>((resolve) => {
		canvas.toBlob(resolve, "image/png");
	});

	if (!blob) {
		throw new Error("Failed to encode capture.");
	}

	return blob;
}
