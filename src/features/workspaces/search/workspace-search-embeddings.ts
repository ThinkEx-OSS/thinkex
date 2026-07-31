import { batchWorkspaceSearchValues } from "#/features/workspaces/search/workspace-search-batches";

const workspaceSearchEmbeddingModel = "@cf/baai/bge-m3";
const embeddingBatchSize = 16;
const maximumEmbeddingAttempts = 4;
const embeddingRetryBaseDelayMs = 250;
const embeddingRetryMaxDelayMs = 2_000;

export interface WorkspaceSearchEmbeddingRetryOptions {
	maxAttempts?: number;
	sleep?: (ms: number) => Promise<void>;
}

export async function embedWorkspaceSearchTexts(
	ai: Ai,
	texts: string[],
	options?: WorkspaceSearchEmbeddingRetryOptions,
) {
	const embeddings: number[][] = [];
	for (const batch of batchWorkspaceSearchValues(texts, embeddingBatchSize)) {
		const output = await runEmbeddingWithRetry(ai, batch, options);
		embeddings.push(...readEmbeddingData(output));
	}
	return embeddings;
}

async function runEmbeddingWithRetry(
	ai: Ai,
	batch: string[],
	options?: WorkspaceSearchEmbeddingRetryOptions,
): Promise<unknown> {
	const maxAttempts = options?.maxAttempts ?? maximumEmbeddingAttempts;
	const sleep = options?.sleep ?? defaultEmbeddingRetrySleep;

	for (let attempt = 1; ; attempt += 1) {
		try {
			return await ai.run(workspaceSearchEmbeddingModel, {
				text: batch,
				truncate_inputs: true,
			});
		} catch (error) {
			// A transient Workers AI hiccup should not consume an index attempt or
			// page anyone: retry the retryable ones in-process before bubbling up.
			if (attempt >= maxAttempts || !isRetryableEmbeddingError(error)) {
				throw error;
			}
			await sleep(embeddingRetryDelayMs(attempt));
		}
	}
}

/**
 * Workers AI surfaces transient upstream failures as an `AiError` whose message
 * leads with a numeric code, e.g. `3043: Internal server error`. Only the
 * server-side classes — 3xxx internal errors and 5xx-class upstream failures —
 * are worth retrying; client/validation codes are permanent and must bubble up.
 */
export function isRetryableEmbeddingError(error: unknown): boolean {
	if (!(error instanceof Error) || !isAiErrorName(error.name)) {
		return false;
	}
	const code = readAiErrorCode(error.message);
	return code !== null && isRetryableAiErrorCode(code);
}

function isAiErrorName(name: string): boolean {
	return name === "AiError" || name === "InferenceUpstreamError" || name === "AiInternalError";
}

function readAiErrorCode(message: string): number | null {
	const match = /^\s*(\d{3,4})\b/.exec(message);
	if (!match?.[1]) {
		return null;
	}
	return Number.parseInt(match[1], 10);
}

function isRetryableAiErrorCode(code: number): boolean {
	return (
		(code >= 3000 && code <= 3999) || (code >= 5000 && code <= 5999) || (code >= 500 && code <= 599)
	);
}

function embeddingRetryDelayMs(attempt: number): number {
	return Math.min(embeddingRetryBaseDelayMs * 2 ** (attempt - 1), embeddingRetryMaxDelayMs);
}

function defaultEmbeddingRetrySleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function readEmbeddingData(output: unknown): number[][] {
	if (!isRecord(output) || !Array.isArray(output.data)) {
		throw new Error("Workspace search embedding response is missing vector data.");
	}

	const data = output.data.filter(
		(vector): vector is number[] =>
			Array.isArray(vector) && vector.every((value) => typeof value === "number"),
	);
	if (data.length !== output.data.length) {
		throw new Error("Workspace search embedding response contains invalid vector data.");
	}
	return data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
