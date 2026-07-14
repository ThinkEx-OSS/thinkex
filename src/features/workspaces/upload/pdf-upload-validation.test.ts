import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceFileUploadError } from "#/features/workspaces/model/workspace-file";
import { assertReadablePdfUpload } from "#/features/workspaces/upload/pdf-upload-validation";

const requestWorkspaceFileProcessor = vi.hoisted(() => vi.fn());

vi.mock("#/features/workspaces/files/workspace-file-processor", () => ({
	requestWorkspaceFileProcessor,
}));

describe("PDF upload validation", () => {
	beforeEach(() => {
		requestWorkspaceFileProcessor.mockReset();
	});

	it("accepts a PDF approved by the isolated validator", async () => {
		requestWorkspaceFileProcessor.mockResolvedValue(new Response(null, { status: 204 }));

		await expect(validate(new Uint8Array([1, 2, 3]))).resolves.toBeUndefined();
		expect(requestWorkspaceFileProcessor).toHaveBeenCalledOnce();
	});

	it("rejects a PDF that requires a password", async () => {
		requestWorkspaceFileProcessor.mockResolvedValue(
			Response.json({ code: "PASSWORD_PROTECTED_PDF" }, { status: 422 }),
		);

		await expect(validate(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({
			code: "PASSWORD_PROTECTED_PDF",
			status: 422,
		});
	});

	it("rejects malformed PDFs without misclassifying them", async () => {
		requestWorkspaceFileProcessor.mockResolvedValue(
			Response.json({ code: "INVALID_PDF" }, { status: 422 }),
		);

		await expect(validate(new Uint8Array([1, 2, 3]))).rejects.toEqual(
			expect.objectContaining<Partial<WorkspaceFileUploadError>>({
				code: "INVALID_PDF",
				status: 422,
			}),
		);
	});

	it("preserves processor failures as retryable server errors", async () => {
		requestWorkspaceFileProcessor.mockResolvedValue(
			Response.json({ error: "temporary failure" }, { status: 500 }),
		);

		await expect(validate(new Uint8Array([1, 2, 3]))).rejects.toThrow(
			"Workspace file processor failed with status 500",
		);
	});

	it("preserves the processor upload limit response", async () => {
		requestWorkspaceFileProcessor.mockResolvedValue(
			Response.json({ code: "UPLOAD_TOO_LARGE" }, { status: 413 }),
		);

		await expect(validate(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({
			code: "UPLOAD_TOO_LARGE",
			status: 413,
		});
	});
});

function validate(bytes: Uint8Array) {
	const body = new Response(bytes.slice().buffer).body;

	if (!body) {
		throw new Error("Test stream was not created.");
	}

	return assertReadablePdfUpload({
		env: {} as Cloudflare.Env,
		object: { body } as R2ObjectBody,
	});
}
