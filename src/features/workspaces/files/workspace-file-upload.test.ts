import { beforeEach, describe, expect, it, vi } from "vitest";

const { captureException, toastError, uploadFileDirectlyToR2 } = vi.hoisted(() => ({
	captureException: vi.fn(),
	toastError: vi.fn(),
	uploadFileDirectlyToR2: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		error: toastError,
		loading: vi.fn(() => "upload-toast"),
		success: vi.fn(),
	},
}));

vi.mock("#/features/workspaces/upload/workspace-file-direct-upload-client", () => ({
	uploadFileDirectlyToR2,
}));

vi.mock("#/features/workspaces/use-workspace-client-mutation-echo", () => ({
	prepareWorkspaceClientMutationInput: <T>(input: T) => ({
		...input,
		clientMutationId: "test-mutation",
	}),
}));

vi.mock("#/integrations/posthog/provider", () => ({
	capturePostHogClientException: captureException,
}));

import { runWorkspaceFileUploadBatch } from "#/features/workspaces/files/workspace-file-upload";

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						completionToken: "completion-token",
						uploadUrl: "https://r2.example/upload",
					}),
					{ headers: { "content-type": "application/json" }, status: 200 },
				),
			),
		),
	);
});

describe("workspace file upload batch failures", () => {
	it("preserves and captures the original upload error once", async () => {
		const error = new Error("Direct file upload failed because of a network error.");
		uploadFileDirectlyToR2.mockRejectedValue(error);

		await runWorkspaceFileUploadBatch({
			files: [new File([new Uint8Array([1])], "paper.pdf", { type: "application/pdf" })],
			onSuccess: vi.fn(),
			parentId: null,
			workspaceId: "workspace-id",
		});

		expect(captureException).toHaveBeenCalledOnce();
		expect(captureException).toHaveBeenCalledWith(error, {
			operation: "workspace_file_upload",
			upload_error_count: 1,
			upload_skipped_count: 0,
			upload_success_count: 0,
		});
	});

	it("does not capture a canceled upload", async () => {
		const error = new DOMException("Upload canceled.", "AbortError");
		uploadFileDirectlyToR2.mockRejectedValue(error);

		await runWorkspaceFileUploadBatch({
			files: [new File([new Uint8Array([1])], "paper.pdf", { type: "application/pdf" })],
			onSuccess: vi.fn(),
			parentId: null,
			workspaceId: "workspace-id",
		});

		expect(captureException).not.toHaveBeenCalled();
		expect(toastError).toHaveBeenCalledWith(
			"Upload canceled.",
			expect.objectContaining({ id: "upload-toast" }),
		);
	});

	it("does not reclassify a cache callback failure as an upload failure", async () => {
		const error = new Error("Cache update failed.");
		uploadFileDirectlyToR2.mockResolvedValue(undefined);

		await expect(
			runWorkspaceFileUploadBatch({
				files: [new File([new Uint8Array([1])], "paper.pdf", { type: "application/pdf" })],
				onSuccess: () => {
					throw error;
				},
				parentId: null,
				workspaceId: "workspace-id",
			}),
		).rejects.toBe(error);

		expect(captureException).not.toHaveBeenCalled();
	});
});
