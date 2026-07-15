import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
	requireWorkspaceFileTypeFromHint,
	WorkspaceFileUploadError,
	type WorkspaceUploadConversion,
} from "#/features/workspaces/model/workspace-file";
import {
	finalizeWorkspaceFileUploadStorage,
	type WorkspaceUploadStreamConverter,
} from "#/features/workspaces/upload/workspace-file-upload-storage";

vi.mock("#/features/workspaces/conversion/image-file-converter", () => ({
	convertImageStreamToJpeg: vi.fn(),
}));
vi.mock("#/features/workspaces/conversion/office-pdf-converter", () => ({
	convertOfficeStreamToPdf: vi.fn(),
}));
const createWorkspaceFilePreview = vi.hoisted(() => vi.fn());

vi.mock("#/features/workspaces/files/workspace-file-preview", () => ({
	createWorkspaceFilePreview,
	WORKSPACE_FILE_PREVIEW_CONTENT_TYPE: "image/webp",
}));

const previewObjectKey = "workspace_file_objects/workspace/item/preview.webp";
const previewBytes = new Uint8Array([7, 8]);

beforeAll(() => {
	vi.stubGlobal(
		"FixedLengthStream",
		class {
			readonly readable: ReadableStream<Uint8Array>;
			readonly writable: WritableStream<Uint8Array>;

			constructor() {
				const stream = new TransformStream<Uint8Array, Uint8Array>();
				this.readable = stream.readable;
				this.writable = stream.writable;
			}
		},
	);
});

describe("workspace file upload storage", () => {
	beforeEach(() => {
		createWorkspaceFilePreview.mockReset().mockResolvedValue({
			body: stream(previewBytes),
			sizeBytes: previewBytes.byteLength,
		});
	});

	it("adopts an unchanged binary already uploaded to its permanent object", async () => {
		const bucket = createR2Bucket();
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const objectKey = "workspace_file_objects/workspace/item/source";

		const result = await finalizeWorkspaceFileUploadStorage({
			contentType: "image/png",
			descriptor: requireWorkspaceFileTypeFromHint({
				fileName: "diagram.png",
				contentType: "image/png",
			}),
			env: createEnv(bucket),
			finalObjectKey: objectKey,
			fileName: "diagram.png",
			fileSize: bytes.byteLength,
			previewObjectKey,
			uploadedObject: createR2Object(objectKey, bytes),
			uploadedObjectKey: objectKey,
		});

		expect(result).toMatchObject({
			fileName: "diagram.png",
			fileSize: 4,
			objectKey: "workspace_file_objects/workspace/item/source",
			preview: {
				objectKey: previewObjectKey,
				sizeBytes: 2,
				sourceHash: `etag:${objectKey}`,
			},
		});
		expect(bucket.putCount()).toBe(1);
		expect(bucket.bytes(previewObjectKey)).toEqual(previewBytes);
	});

	it("streams conversion output to R2 and records source provenance", async () => {
		const bucket = createR2Bucket();
		const converted = new Uint8Array([9, 8, 7]);
		const converter: WorkspaceUploadStreamConverter = vi
			.fn()
			.mockResolvedValue({ body: stream(converted), sizeBytes: converted.byteLength });

		const result = await finalizeWorkspaceFileUploadStorage({
			contentType: "image/heic",
			converters: createConverters(converter),
			descriptor: requireWorkspaceFileTypeFromHint({
				fileName: "photo.heic",
				contentType: "image/heic",
			}),
			env: createEnv(bucket),
			finalObjectKey: "workspace_file_objects/workspace/item/source",
			fileName: "photo.heic",
			fileSize: 5,
			previewObjectKey,
			uploadedObject: createR2Object(
				"workspace_file_uploads/workspace/item/source",
				new Uint8Array([1, 2, 3, 4, 5]),
			),
			uploadedObjectKey: "workspace_file_uploads/workspace/item/source",
		});

		expect(result).toMatchObject({
			contentType: "image/jpeg",
			fileName: "photo.jpg",
			fileSize: 3,
			source: {
				conversion: "heic_to_jpeg",
				fileName: "photo.heic",
				sizeBytes: 5,
			},
		});
		expect(bucket.bytes("workspace_file_objects/workspace/item/source")).toEqual(converted);
		expect(bucket.bytes(previewObjectKey)).toEqual(previewBytes);
	});

	it("rejects an inconsistent permanent object without rewriting it", async () => {
		const bucket = createR2Bucket();

		await expect(
			finalizeWorkspaceFileUploadStorage({
				contentType: "image/png",
				descriptor: requireWorkspaceFileTypeFromHint({
					fileName: "diagram.png",
					contentType: "image/png",
				}),
				env: createEnv(bucket),
				finalObjectKey: "workspace_file_objects/workspace/item/source",
				fileName: "diagram.png",
				fileSize: 4,
				previewObjectKey,
				uploadedObject: createR2Object(
					"workspace_file_objects/workspace/item/source",
					new Uint8Array([1, 2, 3]),
				),
				uploadedObjectKey: "workspace_file_objects/workspace/item/source",
			}),
		).rejects.toThrow("did not match");
		expect(bucket.putCount()).toBe(0);
	});

	it("preserves a canonical PDF when validation infrastructure fails", async () => {
		const bucket = createR2Bucket();
		const objectKey = "workspace_file_objects/workspace/item/source";
		createWorkspaceFilePreview.mockRejectedValue(new Error("Processor unavailable."));

		await expect(
			finalizeWorkspaceFileUploadStorage({
				contentType: "application/pdf",
				descriptor: requireWorkspaceFileTypeFromHint({
					fileName: "report.pdf",
					contentType: "application/pdf",
				}),
				env: createEnv(bucket),
				finalObjectKey: objectKey,
				fileName: "report.pdf",
				fileSize: 4,
				previewObjectKey,
				uploadedObject: createR2Object(objectKey, new Uint8Array([1, 2, 3, 4])),
				uploadedObjectKey: objectKey,
			}),
		).rejects.toThrow("Processor unavailable");
		expect(bucket.deleteCount()).toBe(0);
	});

	it("deletes a canonical PDF rejected as invalid", async () => {
		const bucket = createR2Bucket();
		const objectKey = "workspace_file_objects/workspace/item/source";
		createWorkspaceFilePreview.mockRejectedValue(
			new WorkspaceFileUploadError({
				code: "INVALID_PDF",
				message: "Invalid PDF.",
				status: 422,
			}),
		);

		await expect(
			finalizeWorkspaceFileUploadStorage({
				contentType: "application/pdf",
				descriptor: requireWorkspaceFileTypeFromHint({
					fileName: "report.pdf",
					contentType: "application/pdf",
				}),
				env: createEnv(bucket),
				finalObjectKey: objectKey,
				fileName: "report.pdf",
				fileSize: 4,
				previewObjectKey,
				uploadedObject: createR2Object(objectKey, new Uint8Array([1, 2, 3, 4])),
				uploadedObjectKey: objectKey,
			}),
		).rejects.toThrow("Invalid PDF");
		expect(bucket.deleteCount()).toBe(1);
	});
});

function createConverters(converter: WorkspaceUploadStreamConverter) {
	return {
		heic_to_jpeg: converter,
		office_to_pdf: converter,
	} satisfies Record<WorkspaceUploadConversion, WorkspaceUploadStreamConverter>;
}

function createEnv(bucket: R2Bucket) {
	return { WORKSPACE_KERNEL_FILES: bucket } as Cloudflare.Env;
}

function stream(bytes: Uint8Array) {
	const body = new Response(bytes.slice().buffer).body;

	if (!body) {
		throw new Error("Test stream was not created.");
	}

	return body;
}

function createR2Object(key: string, bytes: Uint8Array) {
	return {
		body: stream(bytes),
		etag: `etag:${key}`,
		key,
		size: bytes.byteLength,
	} as R2ObjectBody;
}

function createR2Bucket() {
	const objects = new Map<string, Uint8Array>();
	let deletes = 0;
	let puts = 0;
	const bucket = {
		async put(key: string, body: ReadableStream<Uint8Array>) {
			puts += 1;
			const value = new Uint8Array(await new Response(body).arrayBuffer());
			objects.set(key, value);
			return { etag: `etag:${key}`, key, size: value.byteLength } as R2Object;
		},
		async get(key: string) {
			const value = objects.get(key);
			return value ? createR2Object(key, value) : null;
		},
		async delete(key: string) {
			deletes += 1;
			objects.delete(key);
		},
		bytes: (key: string) => objects.get(key) ?? null,
		deleteCount: () => deletes,
		putCount: () => puts,
	};

	return bucket as typeof bucket & R2Bucket;
}
