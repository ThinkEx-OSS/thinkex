import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkspaceFileUploadError } from "#/features/workspaces/model/workspace-file";
import { assertReadablePdfUpload } from "#/features/workspaces/upload/pdf-upload-validation";

const getDocumentProxy = vi.hoisted(() => vi.fn());

vi.mock("unpdf", () => ({ getDocumentProxy }));

describe("PDF upload validation", () => {
	afterEach(() => {
		getDocumentProxy.mockReset();
	});

	it("accepts a readable PDF and releases the parser document", async () => {
		const destroy = vi.fn().mockResolvedValue(undefined);
		getDocumentProxy.mockResolvedValue({ destroy });

		await expect(assertReadablePdfUpload(new Uint8Array([1, 2, 3]))).resolves.toBeUndefined();
		expect(destroy).toHaveBeenCalledOnce();
	});

	it("rejects a PDF that requires a password", async () => {
		getDocumentProxy.mockRejectedValue(
			Object.assign(new Error("No password given"), { name: "PasswordException", code: 1 }),
		);

		await expect(assertReadablePdfUpload(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({
			code: "PASSWORD_PROTECTED_PDF",
			status: 422,
		});
	});

	it("rejects malformed PDFs without misclassifying them as password protected", async () => {
		getDocumentProxy.mockRejectedValue(
			Object.assign(new Error("Invalid PDF structure"), { name: "InvalidPDFException" }),
		);

		await expect(assertReadablePdfUpload(new Uint8Array([1, 2, 3]))).rejects.toEqual(
			expect.objectContaining<Partial<WorkspaceFileUploadError>>({
				code: "INVALID_PDF",
				status: 422,
			}),
		);
	});
});
