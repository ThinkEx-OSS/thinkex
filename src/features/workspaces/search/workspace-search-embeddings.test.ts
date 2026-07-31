import { describe, expect, it, vi } from "vitest";

import {
	embedWorkspaceSearchTexts,
	isRetryableEmbeddingError,
} from "#/features/workspaces/search/workspace-search-embeddings";

function aiError(message: string): Error {
	const error = new Error(message);
	error.name = "AiError";
	return error;
}

function embeddingResponse(count: number) {
	return { data: Array.from({ length: count }, () => [0.1, 0.2, 0.3]) };
}

describe("workspace search embeddings", () => {
	it("classifies transient Workers AI errors as retryable", () => {
		expect(isRetryableEmbeddingError(aiError("3043: Internal server error"))).toBe(true);
		expect(isRetryableEmbeddingError(aiError("5006: Service temporarily unavailable"))).toBe(true);
		expect(isRetryableEmbeddingError(aiError("503: upstream unavailable"))).toBe(true);
	});

	it("does not retry permanent client-side errors", () => {
		expect(isRetryableEmbeddingError(aiError("2001: invalid input"))).toBe(false);
		expect(isRetryableEmbeddingError(aiError("400: bad request"))).toBe(false);
		expect(isRetryableEmbeddingError(new Error("some other failure"))).toBe(false);
		expect(isRetryableEmbeddingError("not an error")).toBe(false);
	});

	it("retries a transient failure and returns the eventual embeddings", async () => {
		const run = vi
			.fn()
			.mockRejectedValueOnce(aiError("3043: Internal server error"))
			.mockResolvedValueOnce(embeddingResponse(2));
		const ai = { run } as unknown as Ai;

		const embeddings = await embedWorkspaceSearchTexts(ai, ["one", "two"], {
			sleep: () => Promise.resolve(),
		});

		expect(run).toHaveBeenCalledTimes(2);
		expect(embeddings).toHaveLength(2);
	});

	it("gives up after the attempt budget and rethrows the transient error", async () => {
		const run = vi.fn().mockRejectedValue(aiError("3043: Internal server error"));
		const ai = { run } as unknown as Ai;

		await expect(
			embedWorkspaceSearchTexts(ai, ["one"], { maxAttempts: 3, sleep: () => Promise.resolve() }),
		).rejects.toThrow("3043");
		expect(run).toHaveBeenCalledTimes(3);
	});

	it("fails fast on permanent errors without retrying", async () => {
		const run = vi.fn().mockRejectedValue(aiError("400: bad request"));
		const ai = { run } as unknown as Ai;

		await expect(
			embedWorkspaceSearchTexts(ai, ["one"], { sleep: () => Promise.resolve() }),
		).rejects.toThrow("400");
		expect(run).toHaveBeenCalledTimes(1);
	});
});
