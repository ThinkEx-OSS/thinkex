import { toArrayBuffer } from "#/features/workspaces/extraction/binary";
import type {
	FirecrawlPdfMode,
	MarkdownExtractionInput,
	MarkdownExtractionProvider,
	MarkdownExtractionResult,
} from "#/features/workspaces/extraction/types";
import { createSingleMarkdownProjectionPage } from "#/features/workspaces/extraction/page-markdown-projection";
import {
	firecrawlJsonRequest,
	getFirstArrayRecord,
	getNumberValue,
	getRecordValue,
	getStringValue,
} from "#/integrations/firecrawl/client";

const firecrawlParseTimeoutMs = 300_000;

export function createFirecrawlPdfExtractionProvider(
	env: Cloudflare.Env,
): MarkdownExtractionProvider {
	return {
		id: "firecrawl",
		async extract(input) {
			const mode = normalizeFirecrawlMode(input.mode);
			const formData = new FormData();
			formData.set(
				"options",
				JSON.stringify({
					formats: ["markdown"],
					parsers: [{ type: "pdf", mode }],
					timeout: firecrawlParseTimeoutMs,
				}),
			);
			formData.set(
				"file",
				new File([toArrayBuffer(input.bytes)], input.fileName, {
					type: input.contentType || "application/pdf",
				}),
			);

			const responseJson = await firecrawlJsonRequest({
				env,
				path: "/v2/parse",
				operation: "Firecrawl PDF parsing",
				method: "POST",
				body: formData,
			});

			const markdown = getFirecrawlMarkdown(responseJson);

			if (!markdown) {
				throw new Error("Firecrawl PDF parsing completed without markdown output.");
			}

			return {
				pages: createSingleMarkdownProjectionPage(markdown),
				provider: "firecrawl",
				providerMode: mode,
				metadata: getFirecrawlMetadata(responseJson),
			} satisfies MarkdownExtractionResult;
		},
	};
}

function normalizeFirecrawlMode(mode: MarkdownExtractionInput["mode"]): FirecrawlPdfMode {
	if (mode === "fast" || mode === "ocr") {
		return mode;
	}

	return "auto";
}

function getFirecrawlMarkdown(value: unknown): string | null {
	const candidates = [
		value,
		getRecordValue(value, "data"),
		getRecordValue(value, "document"),
		getRecordValue(value, "result"),
		getFirstArrayRecord(getRecordValue(value, "data")),
		getFirstArrayRecord(getRecordValue(value, "documents")),
		getFirstArrayRecord(getRecordValue(value, "results")),
	];

	for (const candidate of candidates) {
		const markdown = getRecordValue(candidate, "markdown");

		if (typeof markdown === "string" && markdown.trim().length > 0) {
			return markdown;
		}
	}

	return null;
}

function getFirecrawlMetadata(value: unknown) {
	const data = getRecordValue(value, "data");
	const usage = getRecordValue(value, "usage") ?? getRecordValue(data, "usage");
	const metadata = getRecordValue(data, "metadata") ?? getRecordValue(value, "metadata");
	const creditsUsed =
		getNumberValue(metadata, "creditsUsed") ??
		getNumberValue(usage, "credits") ??
		getNumberValue(data, "creditsUsed") ??
		getNumberValue(value, "creditsUsed");
	const title = getStringValue(metadata, "title") ?? getStringValue(data, "title");
	const sourceFile = getStringValue(metadata, "sourceFile") ?? getStringValue(data, "sourceFile");
	const pageCount =
		getNumberValue(metadata, "numPages") ??
		getNumberValue(metadata, "pageCount") ??
		getNumberValue(data, "numPages") ??
		getNumberValue(data, "pageCount") ??
		getNumberValue(value, "numPages") ??
		getNumberValue(value, "pageCount");
	const result: Record<string, string | number> = {};

	if (creditsUsed !== null) {
		result.creditsUsed = creditsUsed;
	}

	if (pageCount !== null) {
		result.numPages = pageCount;
		result.pageCount = pageCount;
	}

	if (title !== null) {
		result.title = title;
	}

	if (sourceFile !== null) {
		result.sourceFile = sourceFile;
	}

	return result;
}
