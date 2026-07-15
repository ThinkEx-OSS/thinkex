import { describe, expect, it } from "vitest";

import { WorkspaceFileUploadError } from "#/features/workspaces/model/workspace-file";
import { assertPreparedPdfPreviewResponse } from "#/features/workspaces/upload/pdf-upload-validation";

describe("PDF upload validation", () => {
	it("accepts a prepared PDF preview", async () => {
		await expect(
			assertPreparedPdfPreviewResponse(new Response(new Uint8Array([1]))),
		).resolves.toBeUndefined();
	});

	it("rejects a PDF that requires a password", async () => {
		await expect(
			assertPreparedPdfPreviewResponse(
				Response.json({ code: "PASSWORD_PROTECTED_PDF" }, { status: 422 }),
			),
		).rejects.toMatchObject({ code: "PASSWORD_PROTECTED_PDF", status: 422 });
	});

	it("rejects malformed PDFs without misclassifying them", async () => {
		await expect(
			assertPreparedPdfPreviewResponse(Response.json({ code: "INVALID_PDF" }, { status: 422 })),
		).rejects.toEqual(
			expect.objectContaining<Partial<WorkspaceFileUploadError>>({
				code: "INVALID_PDF",
				status: 422,
			}),
		);
	});

	it("preserves processor failures as retryable server errors", async () => {
		await expect(
			assertPreparedPdfPreviewResponse(
				Response.json({ error: "temporary failure" }, { status: 500 }),
			),
		).rejects.toThrow("Workspace file processor failed with status 500");
	});

	it("preserves the processor upload limit response", async () => {
		await expect(
			assertPreparedPdfPreviewResponse(
				Response.json({ code: "UPLOAD_TOO_LARGE" }, { status: 413 }),
			),
		).rejects.toMatchObject({ code: "UPLOAD_TOO_LARGE", status: 413 });
	});
});
