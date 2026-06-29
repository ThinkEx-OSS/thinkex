import { PhotonImage, resize, SamplingFilter } from "@cf-wasm/photon/workerd";
import type { ImageDataLike } from "@embedpdf/models";

import { getPdfiumNative } from "#/features/workspaces/files/pdfium-server";
import { WORKSPACE_FILE_PREVIEW_MAX_WIDTH } from "#/features/workspaces/files/workspace-file-preview.constants";
import type {
	WorkspaceFilePreviewGeneratorId,
	WorkspaceFileTypeDescriptor,
} from "#/features/workspaces/model/workspace-file";

export {
	WORKSPACE_FILE_PREVIEW_CONTENT_TYPE,
	WORKSPACE_FILE_PREVIEW_MAX_WIDTH,
} from "#/features/workspaces/files/workspace-file-preview.constants";

export interface WorkspaceFilePreviewResult {
	bytes: Uint8Array;
	width: number;
	height: number;
}

type PreviewGenerator = (bytes: Uint8Array) => Promise<WorkspaceFilePreviewResult>;

const workspaceFilePreviewGenerators: Record<WorkspaceFilePreviewGeneratorId, PreviewGenerator> = {
	pdf_webp: generatePdfPreviewWebp,
	image_webp: generateImagePreviewWebp,
};

export function resolveUploadPreviewGenerator(
	descriptor: WorkspaceFileTypeDescriptor,
): PreviewGenerator | null {
	if (!descriptor.previewGenerator) {
		return null;
	}

	return workspaceFilePreviewGenerators[descriptor.previewGenerator] ?? null;
}

export async function generateImagePreviewWebp(
	bytes: Uint8Array,
): Promise<WorkspaceFilePreviewResult> {
	const inputImage = PhotonImage.new_from_byteslice(bytes);

	try {
		return encodePreviewWebp(inputImage);
	} finally {
		inputImage.free();
	}
}

export async function generatePdfPreviewWebp(
	bytes: Uint8Array,
): Promise<WorkspaceFilePreviewResult> {
	const native = await getPdfiumNative();
	const document = await native
		.openDocumentBuffer({ id: "preview", content: toArrayBuffer(bytes) })
		.toPromise();
	const page = document.pages[0];

	if (!page) {
		await native.closeDocument(document).toPromise();
		throw new Error("PDF has no pages.");
	}

	const scaleFactor = WORKSPACE_FILE_PREVIEW_MAX_WIDTH / page.size.width;

	try {
		const rendered = await native
			.renderPageRaw(document, page, {
				scaleFactor,
				withAnnotations: false,
			})
			.toPromise();

		return rgbaToPreviewWebp(rendered);
	} finally {
		await native.closeDocument(document).toPromise();
	}
}

function rgbaToPreviewWebp(image: ImageDataLike): WorkspaceFilePreviewResult {
	const inputImage = new PhotonImage(
		new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength),
		image.width,
		image.height,
	);

	try {
		return encodePreviewWebp(inputImage);
	} finally {
		inputImage.free();
	}
}

function encodePreviewWebp(inputImage: PhotonImage): WorkspaceFilePreviewResult {
	const outputImage = resizePreviewImage(inputImage);
	const previewBytes = outputImage.get_bytes_webp();
	const result = {
		bytes: previewBytes,
		width: outputImage.get_width(),
		height: outputImage.get_height(),
	};

	if (outputImage !== inputImage) {
		outputImage.free();
	}

	return result;
}

function resizePreviewImage(image: PhotonImage): PhotonImage {
	const width = image.get_width();
	const height = image.get_height();

	if (width <= WORKSPACE_FILE_PREVIEW_MAX_WIDTH) {
		return image;
	}

	const newWidth = WORKSPACE_FILE_PREVIEW_MAX_WIDTH;
	const newHeight = Math.max(1, Math.round(height * (newWidth / width)));

	return resize(image, newWidth, newHeight, SamplingFilter.Lanczos3);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	if (
		bytes.byteOffset === 0 &&
		bytes.byteLength === bytes.buffer.byteLength &&
		bytes.buffer instanceof ArrayBuffer
	) {
		return bytes.buffer;
	}

	return bytes.slice().buffer;
}
