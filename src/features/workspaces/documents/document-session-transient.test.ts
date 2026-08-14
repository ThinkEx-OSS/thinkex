import { describe, expect, it } from "vitest";

import {
	isTransientDocumentSessionError,
	retryOnTransientDocumentSessionReset,
} from "#/features/workspaces/documents/document-session-transient";

describe("isTransientDocumentSessionError", () => {
	it("matches the mid-turn storage-timeout reset", () => {
		const error = new Error(
			"Durable Object storage operation exceeded timeout which caused object to be reset",
		);
		expect(isTransientDocumentSessionError(error)).toBe(true);
	});

	it("finds the reset through a wrapped cause chain", () => {
		const error = new Error("RPC failed", {
			cause: new Error("internal error ... caused object to be reset"),
		});
		expect(isTransientDocumentSessionError(error)).toBe(true);
	});

	it("does not match an ordinary application error", () => {
		expect(isTransientDocumentSessionError(new Error("Document session has been deleted."))).toBe(
			false,
		);
	});
});

describe("retryOnTransientDocumentSessionReset", () => {
	it("replays after a reset and returns the later result", async () => {
		let attempts = 0;
		const result = await retryOnTransientDocumentSessionReset(async () => {
			attempts += 1;
			if (attempts === 1) {
				throw new Error("storage operation exceeded timeout which caused object to be reset");
			}
			return "applied";
		});
		expect(attempts).toBe(2);
		expect(result).toBe("applied");
	});

	it("rethrows a non-transient error without retrying", async () => {
		let attempts = 0;
		await expect(
			retryOnTransientDocumentSessionReset(async () => {
				attempts += 1;
				throw new Error("content_changed");
			}),
		).rejects.toThrow("content_changed");
		expect(attempts).toBe(1);
	});

	it("gives up after the retry budget and rethrows the last reset", async () => {
		let attempts = 0;
		await expect(
			retryOnTransientDocumentSessionReset(async () => {
				attempts += 1;
				throw new Error("caused object to be reset");
			}),
		).rejects.toThrow("caused object to be reset");
		expect(attempts).toBe(3);
	});
});
