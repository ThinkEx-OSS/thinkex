import { describe, expect, it } from "vitest";

import { isTransientDurableObjectError } from "#/features/workspaces/durable-object-errors";

describe("isTransientDurableObjectError", () => {
	it("matches retryable errors, storage resets, and memory-limit resets", () => {
		expect(isTransientDurableObjectError(Object.assign(new Error("x"), { retryable: true }))).toBe(
			true,
		);
		expect(
			isTransientDurableObjectError(Object.assign(new Error("x"), { durableObjectReset: true })),
		).toBe(true);
		expect(
			isTransientDurableObjectError(
				new Error("Internal error in Durable Object storage caused object to be reset."),
			),
		).toBe(true);
		expect(
			isTransientDurableObjectError(
				new Error("Durable Object's isolate exceeded its memory limit and was reset."),
			),
		).toBe(true);
	});

	it("rejects overloaded objects and other errors", () => {
		expect(
			isTransientDurableObjectError(
				Object.assign(new Error("x"), { overloaded: true, retryable: true }),
			),
		).toBe(false);
		expect(isTransientDurableObjectError(new Error("boom"))).toBe(false);
		expect(isTransientDurableObjectError("reset")).toBe(false);
	});
});
