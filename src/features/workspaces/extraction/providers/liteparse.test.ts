import { describe, expect, it, vi } from "vitest";

import { extractPdfWithLiteParse } from "#/features/workspaces/extraction/providers/liteparse";
import { parseLiteParsePage } from "#/features/workspaces/extraction/providers/liteparse-response";
import { requestWorkspaceFileProcessor } from "#/features/workspaces/files/workspace-file-processor";

vi.mock("#/features/workspaces/files/workspace-file-processor", () => ({
	requestWorkspaceFileProcessor: vi.fn(),
}));

describe("LiteParse response parsing", () => {
	it("accepts one canonical page record", () => {
		expect(parseLiteParsePage({ markdown: "  # First  ", pageNumber: 1 })).toEqual({
			markdown: "# First",
			pageNumber: 1,
		});
	});

	it("keeps blank pages so PDF page numbering remains stable", () => {
		expect(parseLiteParsePage({ markdown: " \n\t", pageNumber: 1 })).toEqual({
			markdown: "",
			pageNumber: 1,
		});
	});

	it.each([
		undefined,
		{},
		{ markdown: "document markdown without page data" },
		{ markdown: "Text", pageNumber: 0 },
		{ markdown: 123, pageNumber: 1 },
	])("rejects malformed container responses", (payload) => {
		expect(() => parseLiteParsePage(payload)).toThrow("LiteParse returned an invalid");
	});

	// The workflow reads this error's name to decide whether to skip the paid tier, so
	// mislabelling a refusal here means paying a provider to reach the same verdict.
	it("reports a rejected document as unsupported rather than a retryable failure", async () => {
		vi.mocked(requestWorkspaceFileProcessor).mockResolvedValue(
			Response.json(
				{ code: "TOO_MANY_PAGES", error: "PDFs longer than 4999 pages." },
				{ status: 422 },
			),
		);
		const pages = extractPdfWithLiteParse({} as Cloudflare.Env, {
			body: new ReadableStream<Uint8Array>(),
			fileName: "document.pdf",
			sizeBytes: 1,
		});

		await expect(pages.next()).rejects.toMatchObject({
			name: "WorkspaceDocumentUnsupportedError",
			message: "PDFs longer than 4999 pages.",
		});
	});

	it("treats any other processor failure as retryable", async () => {
		vi.mocked(requestWorkspaceFileProcessor).mockResolvedValue(new Response("", { status: 500 }));
		const pages = extractPdfWithLiteParse({} as Cloudflare.Env, {
			body: new ReadableStream<Uint8Array>(),
			fileName: "document.pdf",
			sizeBytes: 1,
		});

		await expect(pages.next()).rejects.toMatchObject({ name: "Error" });
	});

	it("rejects an oversized NDJSON record and cancels the processor response", async () => {
		const cancel = vi.fn();
		const body = new ReadableStream<Uint8Array>({
			cancel,
			start(controller) {
				controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1));
			},
		});
		vi.mocked(requestWorkspaceFileProcessor).mockResolvedValue({
			body,
			ok: true,
		} as Response);
		const pages = extractPdfWithLiteParse({} as Cloudflare.Env, {
			body: new ReadableStream<Uint8Array>(),
			fileName: "document.pdf",
			sizeBytes: 1,
		});

		await expect(pages.next()).rejects.toThrow("oversized NDJSON page");
		expect(cancel).toHaveBeenCalledOnce();
	});
});
