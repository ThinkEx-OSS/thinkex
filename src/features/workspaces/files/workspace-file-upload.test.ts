import { afterEach, describe, expect, it, vi } from "vitest";

import { runWorkspaceFileUploadBatch } from "#/features/workspaces/files/workspace-file-upload";

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		promise: vi.fn(),
	},
}));

function pptxFile(name: string) {
	return new File(["deck"], name, {
		type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	});
}

function conversionFailureResponse() {
	return new Response(
		JSON.stringify({
			requestId: "req_test",
			code: "CONVERSION_FAILED",
			message: "Unable to convert this file to PDF right now.",
			details: { message: "LibreOffice conversion failed: timed out." },
		}),
		{ status: 422, headers: { "content-type": "application/json" } },
	);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("runWorkspaceFileUploadBatch", () => {
	it("surfaces the real server reason when a single office conversion fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => conversionFailureResponse()),
		);

		await expect(
			runWorkspaceFileUploadBatch({
				workspaceId: "ws_1",
				parentId: null,
				files: [pptxFile("23. Special Topic Limb Loss.pptx")],
				onSuccess: () => {},
			}),
		).rejects.toMatchObject({
			message:
				"Failed to upload 23. Special Topic Limb Loss.pptx. Unable to convert this file to PDF right now.",
		});

		vi.unstubAllGlobals();
	});

	it("attaches the underlying failure as the error cause", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => conversionFailureResponse()),
		);

		const error = await runWorkspaceFileUploadBatch({
			workspaceId: "ws_1",
			parentId: null,
			files: [pptxFile("deck.pptx")],
			onSuccess: () => {},
		}).catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(Error);
		expect((error as Error).cause).toBeInstanceOf(Error);
		expect(((error as Error).cause as Error).message).toBe(
			"Unable to convert this file to PDF right now.",
		);

		vi.unstubAllGlobals();
	});
});
