import type { MarkdownProjectionPage } from "#/features/workspaces/extraction/page-markdown-projection";
import type {
	MarkdownExtractionProvider,
	MarkdownExtractionResult,
} from "#/features/workspaces/extraction/types";
import {
	firecrawlJsonRequest,
	getBooleanValue,
	getFirecrawlErrorMessage,
	getNumberValue,
	getRecordArrayValue,
	getRecordValue,
} from "#/integrations/firecrawl/client";
import { createStreamingMultipartFile } from "#/lib/http/streaming-multipart";

const firecrawlPdfTimeoutMs = 30 * 60_000;

export function createFirecrawlPdfExtractionProvider(env: Env): MarkdownExtractionProvider {
	return {
		id: "firecrawl_pdf",
		async extract(input) {
			const multipart = createStreamingMultipartFile({
				body: input.body,
				contentType: input.contentType || "application/pdf",
				fields: { options: JSON.stringify(buildFirecrawlPdfParseOptions()) },
				fileName: input.fileName,
				formFieldName: "file",
				sizeBytes: input.sizeBytes,
			});
			const response = await multipart.awaitResponse(
				firecrawlJsonRequest({
					env,
					path: "/v2/parse",
					operation: "Firecrawl PDF extraction",
					method: "POST",
					headers: { "content-type": multipart.contentType },
					body: multipart.body,
				}),
			);
			if (getBooleanValue(response, "success") !== true) {
				throw new Error(`Firecrawl PDF extraction failed: ${getFirecrawlErrorMessage(response)}`);
			}

			const data = getRecordValue(response, "data");
			const pages = getFirecrawlPdfPages(data);
			if (pages.length === 0) {
				throw new Error("Firecrawl PDF extraction completed without page Markdown.");
			}

			const metadata = getRecordValue(data, "metadata");
			const pageCount =
				getNumberValue(metadata, "numPages") ?? pages.at(-1)?.pageNumber ?? pages.length;

			return {
				pages,
				provider: "firecrawl_pdf",
				providerMode: "ocr",
				metadata: {
					creditsUsed: pageCount,
					numPages: pageCount,
					pageCount,
				},
			} satisfies MarkdownExtractionResult;
		},
	};
}

export function buildFirecrawlPdfParseOptions() {
	return {
		formats: ["markdown"],
		parsers: [{ type: "pdf", mode: "ocr", pages: true }],
		timeout: firecrawlPdfTimeoutMs,
	};
}

export function getFirecrawlPdfPages(value: unknown): MarkdownProjectionPage[] {
	return getRecordArrayValue(value, "pages")
		.map((page, index) => {
			const markdown = getRecordValue(page, "markdown");
			if (typeof markdown !== "string") return null;

			return {
				pageNumber: getNumberValue(page, "pageNumber") ?? index + 1,
				markdown: markdown.trim(),
			} satisfies MarkdownProjectionPage;
		})
		.filter((page): page is MarkdownProjectionPage => page !== null);
}
