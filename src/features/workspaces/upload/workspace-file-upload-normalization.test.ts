import { describe, expect, it, vi } from "vitest";

import { requireWorkspaceFileTypeFromHint } from "#/features/workspaces/model/workspace-file";
import { prepareWorkspaceFileUpload } from "#/features/workspaces/upload/workspace-file-upload-normalization";

const assertReadablePdfUpload = vi.hoisted(() => vi.fn());

vi.mock("#/features/workspaces/conversion/image-file-converter", () => ({
	convertImageFileToJpeg: vi.fn(),
}));
vi.mock("#/features/workspaces/conversion/office-pdf-converter", () => ({
	convertOfficeFileToPdf: vi.fn(),
}));
vi.mock("#/features/workspaces/upload/pdf-upload-validation", () => ({
	assertReadablePdfUpload,
}));

describe("workspace file upload normalization", () => {
	it("validates converted PDF bytes without consuming the upload body", async () => {
		const convertedBytes = new Uint8Array([1, 2, 3]).buffer;
		assertReadablePdfUpload.mockImplementation((bytes: ArrayBuffer) => {
			new Uint8Array(bytes)[0] = 9;
		});

		const file = new File(["source"], "notes.docx", {
			type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		});
		const descriptor = requireWorkspaceFileTypeFromHint({
			fileName: file.name,
			contentType: file.type,
		});

		const prepared = await prepareWorkspaceFileUpload({
			converters: {
				heic_to_jpeg: vi.fn(),
				office_to_pdf: vi.fn().mockResolvedValue({
					bytes: convertedBytes,
					contentType: "application/pdf",
					sizeBytes: 3,
				}),
			},
			descriptor,
			env: {} as Cloudflare.Env,
			file,
		});

		expect(prepared.body).toBe(convertedBytes);
		expect(new Uint8Array(prepared.body as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]));
		expect(assertReadablePdfUpload).toHaveBeenCalledWith(expect.any(ArrayBuffer));
		expect(assertReadablePdfUpload.mock.calls[0]?.[0]).not.toBe(convertedBytes);
	});
});
