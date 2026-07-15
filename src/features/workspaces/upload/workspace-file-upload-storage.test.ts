import { beforeAll, describe, expect, it, vi } from "vitest";

import {
	requireWorkspaceFileTypeFromHint,
	type WorkspaceUploadConversion,
} from "#/features/workspaces/model/workspace-file";
import {
	storeWorkspaceFileUpload,
	type WorkspaceUploadStreamConverter,
} from "#/features/workspaces/upload/workspace-file-upload-storage";

vi.mock("#/features/workspaces/conversion/image-file-converter", () => ({
	convertImageStreamToJpeg: vi.fn(),
}));
vi.mock("#/features/workspaces/conversion/office-pdf-converter", () => ({
	convertOfficeStreamToPdf: vi.fn(),
}));
vi.mock("#/features/workspaces/upload/pdf-upload-validation", () => ({
	assertReadablePdfUpload: vi.fn(),
}));

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
	it("streams an unchanged binary upload into its permanent object", async () => {
		const bucket = createR2Bucket();
		const bytes = new Uint8Array([1, 2, 3, 4]);

		const result = await storeWorkspaceFileUpload({
			body: stream(bytes),
			contentType: "image/png",
			descriptor: requireWorkspaceFileTypeFromHint({
				fileName: "diagram.png",
				contentType: "image/png",
			}),
			env: createEnv(bucket),
			fileName: "diagram.png",
			fileSize: bytes.byteLength,
			objectKey: "workspace_file_objects/workspace/item/source",
		});

		expect(result).toMatchObject({
			fileName: "diagram.png",
			fileSize: 4,
			objectKey: "workspace_file_objects/workspace/item/source",
		});
		expect(bucket.bytes()).toEqual(bytes);
	});

	it("streams conversion output to R2 and records source provenance", async () => {
		const bucket = createR2Bucket();
		const converted = new Uint8Array([9, 8, 7]);
		const converter: WorkspaceUploadStreamConverter = vi
			.fn()
			.mockResolvedValue({ body: stream(converted), sizeBytes: converted.byteLength });

		const result = await storeWorkspaceFileUpload({
			body: stream(new Uint8Array([1, 2, 3, 4, 5])),
			contentType: "image/heic",
			converters: createConverters(converter),
			descriptor: requireWorkspaceFileTypeFromHint({
				fileName: "photo.heic",
				contentType: "image/heic",
			}),
			env: createEnv(bucket),
			fileName: "photo.heic",
			fileSize: 5,
			objectKey: "workspace_file_objects/workspace/item/source",
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
		expect(bucket.bytes()).toEqual(converted);
	});

	it("removes a partial object when the uploaded size is inconsistent", async () => {
		const bucket = createR2Bucket();

		await expect(
			storeWorkspaceFileUpload({
				body: stream(new Uint8Array([1, 2, 3])),
				contentType: "image/png",
				descriptor: requireWorkspaceFileTypeFromHint({
					fileName: "diagram.png",
					contentType: "image/png",
				}),
				env: createEnv(bucket),
				fileName: "diagram.png",
				fileSize: 4,
				objectKey: "workspace_file_objects/workspace/item/source",
			}),
		).rejects.toThrow("did not match");
		expect(bucket.bytes()).toBeNull();
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

function createR2Bucket() {
	let value: Uint8Array | null = null;
	const bucket = {
		async put(key: string, body: ReadableStream<Uint8Array>) {
			value = new Uint8Array(await new Response(body).arrayBuffer());
			return { key, size: value.byteLength } as R2Object;
		},
		async delete() {
			value = null;
		},
		bytes: () => value,
	};

	return bucket as typeof bucket & R2Bucket;
}
