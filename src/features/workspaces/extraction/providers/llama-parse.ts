import { toArrayBuffer } from "#/features/workspaces/extraction/binary";
import {
	createSingleMarkdownProjectionPage,
	type MarkdownProjectionPage,
} from "#/features/workspaces/extraction/page-markdown-projection";
import type {
	LlamaParseTier,
	MarkdownExtractionInput,
	MarkdownExtractionProvider,
	MarkdownExtractionResult,
} from "#/features/workspaces/extraction/types";
import {
	getNumberValue,
	getRecordArrayValue,
	getRecordValue,
	getStringValue,
	llamaCloudJsonRequest,
} from "#/integrations/llamaparse/client";

const llamaParsePollIntervalMs = 2_000;
const llamaParseMaxPollMs = 300_000;
const llamaParseVersion = "latest";

export function createLlamaParseExtractionProvider(env: Env): MarkdownExtractionProvider {
	return {
		id: "llama_parse",
		async extract(input) {
			const tier = normalizeLlamaParseTier(input.mode);
			const fileId = await uploadLlamaParseFile(env, input);
			const jobId = await startLlamaParseJob(env, { fileId, tier });
			const result = await pollLlamaParseJob(env, jobId);
			const pages = getLlamaParseMarkdownPages(result);
			const projectionPages =
				pages.length > 0
					? pages
					: createSingleMarkdownProjectionPage(getLlamaParseMarkdown(result) ?? "");

			if (projectionPages.length === 0) {
				throw new Error("LlamaParse completed without markdown output.");
			}

			return {
				pages: projectionPages,
				provider: "llama_parse",
				providerMode: tier,
				metadata: getLlamaParseMetadata(result, {
					fileId,
					jobId,
					pageCount: projectionPages.length,
					tier,
				}),
			} satisfies MarkdownExtractionResult;
		},
	};
}

function normalizeLlamaParseTier(mode: MarkdownExtractionInput["mode"]): LlamaParseTier {
	if (mode === "cost_effective" || mode === "agentic_plus") {
		return mode;
	}

	return "agentic";
}

async function uploadLlamaParseFile(env: Env, input: MarkdownExtractionInput) {
	const formData = new FormData();
	formData.set("purpose", "parse");
	formData.set(
		"file",
		new File([toArrayBuffer(input.bytes)], input.fileName, {
			type: input.contentType || "application/pdf",
		}),
	);

	const responseJson = await llamaCloudJsonRequest({
		env,
		path: "/api/v1/beta/files",
		operation: "LlamaParse file upload",
		method: "POST",
		body: formData,
	});
	const fileId = getStringValue(responseJson, "id");

	if (!fileId) {
		throw new Error("LlamaParse file upload completed without a file id.");
	}

	return fileId;
}

async function startLlamaParseJob(
	env: Env,
	input: {
		fileId: string;
		tier: LlamaParseTier;
	},
) {
	const responseJson = await llamaCloudJsonRequest({
		env,
		path: "/api/v2/parse",
		operation: "LlamaParse job start",
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			file_id: input.fileId,
			tier: input.tier,
			version: llamaParseVersion,
			output_options: {
				markdown: {
					tables: {
						output_tables_as_markdown: true,
					},
				},
			},
			processing_options: {
				cost_optimizer: {
					enable: true,
				},
			},
		}),
	});
	const jobId = getStringValue(responseJson, "id");

	if (!jobId) {
		throw new Error("LlamaParse job start completed without a job id.");
	}

	return jobId;
}

async function pollLlamaParseJob(env: Env, jobId: string) {
	const startedAt = Date.now();

	while (Date.now() - startedAt < llamaParseMaxPollMs) {
		const responseJson = await llamaCloudJsonRequest({
			env,
			path: `/api/v2/parse/${jobId}?expand=markdown,metadata,job_metadata`,
			operation: "LlamaParse job result",
		});
		const job = getRecordValue(responseJson, "job") ?? responseJson;
		const status = getStringValue(job, "status");

		if (status === "COMPLETED") {
			return responseJson;
		}

		if (status === "FAILED" || status === "CANCELLED") {
			throw new Error(`LlamaParse job ${status.toLowerCase()}.`);
		}

		await wait(llamaParsePollIntervalMs);
	}

	throw new Error("LlamaParse job timed out.");
}

function getLlamaParseMarkdownPages(value: unknown): MarkdownProjectionPage[] {
	const markdown = getRecordValue(value, "markdown");
	const pages = getRecordArrayValue(markdown, "pages");

	return pages
		.map((page, index) => {
			const pageMarkdown = getStringValue(page, "markdown")?.trim();

			if (!pageMarkdown) {
				return null;
			}

			return {
				pageNumber:
					getNumberValue(page, "page") ??
					getNumberValue(page, "page_number") ??
					getNumberValue(page, "pageNumber") ??
					index + 1,
				markdown: pageMarkdown,
			} satisfies MarkdownProjectionPage;
		})
		.filter((page): page is MarkdownProjectionPage => page !== null);
}

function getLlamaParseMarkdown(value: unknown) {
	const markdown = getRecordValue(value, "markdown");
	const candidates = [
		getStringValue(markdown, "markdown"),
		getStringValue(markdown, "text"),
		getStringValue(value, "markdown"),
		getStringValue(value, "text"),
	];

	return candidates.find((candidate) => candidate && candidate.trim().length > 0)?.trim() ?? null;
}

function getLlamaParseMetadata(
	value: unknown,
	input: {
		fileId: string;
		jobId: string;
		pageCount: number;
		tier: LlamaParseTier;
	},
) {
	const metadata = getRecordValue(value, "metadata");
	const usage = getRecordValue(value, "usage");
	const job = getRecordValue(value, "job");
	const result: Record<string, string | number | boolean | null> = {
		fileId: input.fileId,
		jobId: input.jobId,
		tier: input.tier,
		version: getStringValue(metadata, "version") ?? llamaParseVersion,
	};
	const pageCount =
		input.pageCount ||
		getNumberValue(metadata, "page_count") ||
		getNumberValue(metadata, "pageCount") ||
		getNumberValue(value, "page_count") ||
		getNumberValue(value, "pageCount");
	const creditsUsed =
		getNumberValue(usage, "credits") ??
		getNumberValue(usage, "credits_used") ??
		getNumberValue(metadata, "credits") ??
		getNumberValue(metadata, "credits_used");
	const status = getStringValue(job, "status") ?? getStringValue(value, "status");

	if (pageCount !== null) {
		result.numPages = pageCount;
		result.pageCount = pageCount;
	}

	if (creditsUsed !== null) {
		result.creditsUsed = creditsUsed;
	}

	if (status !== null) {
		result.status = status;
	}

	return result;
}

function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
