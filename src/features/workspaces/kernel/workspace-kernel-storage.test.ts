import { describe, expect, it, vi } from "vitest";

import {
	isTransientStorageError,
	runKernelSqlWithRetry,
} from "#/features/workspaces/kernel/workspace-kernel-storage";

class SqlError extends Error {
	constructor(cause: unknown) {
		const message = cause instanceof Error ? cause.message : String(cause);
		super(`SQL query failed: ${message}`);
		this.name = "SqlError";
		this.cause = cause;
	}
}

describe("workspace kernel storage transient errors", () => {
	it("classifies a mid-query Durable Object reset as transient", () => {
		const error = new SqlError(
			new Error("Internal error in Durable Object storage caused object to be reset"),
		);

		expect(isTransientStorageError(error)).toBe(true);
	});

	it("classifies the underlying reset error directly", () => {
		const error = new Error("Internal error in Durable Object storage caused object to be reset");

		expect(isTransientStorageError(error)).toBe(true);
	});

	it("does not classify a genuine query defect as transient", () => {
		const error = new SqlError(new Error("no such column: bogus"));

		expect(isTransientStorageError(error)).toBe(false);
	});

	it("tolerates non-error values", () => {
		expect(isTransientStorageError("boom")).toBe(false);
		expect(isTransientStorageError(undefined)).toBe(false);
	});

	it("retries a transient reset and returns once it succeeds", () => {
		const run = vi
			.fn<() => string>()
			.mockImplementationOnce(() => {
				throw new SqlError(
					new Error("Internal error in Durable Object storage caused object to be reset"),
				);
			})
			.mockReturnValueOnce("ok");

		expect(runKernelSqlWithRetry(run)).toBe("ok");
		expect(run).toHaveBeenCalledTimes(2);
	});

	it("rethrows a non-transient error without retrying", () => {
		const error = new SqlError(new Error("no such column: bogus"));
		const run = vi.fn<() => never>().mockImplementation(() => {
			throw error;
		});

		expect(() => runKernelSqlWithRetry(run)).toThrow(error);
		expect(run).toHaveBeenCalledTimes(1);
	});

	it("gives up after a bounded number of transient failures", () => {
		const run = vi.fn<() => never>().mockImplementation(() => {
			throw new SqlError(
				new Error("Internal error in Durable Object storage caused object to be reset"),
			);
		});

		expect(() => runKernelSqlWithRetry(run)).toThrow(/caused object to be reset/);
		expect(run).toHaveBeenCalledTimes(3);
	});
});
