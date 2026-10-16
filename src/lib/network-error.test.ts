import { describe, expect, it } from "vitest";

import { isNetworkError } from "#/lib/network-error";

describe("isNetworkError", () => {
	it("matches browser fetch network failures", () => {
		expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
		expect(isNetworkError(new TypeError("NetworkError when attempting to fetch resource."))).toBe(
			true,
		);
		expect(isNetworkError(new TypeError("Load failed"))).toBe(true);
	});

	it("does not match other errors", () => {
		expect(isNetworkError(new Error("Failed to fetch"))).toBe(false);
		expect(isNetworkError(new TypeError("Cannot read properties of undefined"))).toBe(false);
		expect(isNetworkError("Failed to fetch")).toBe(false);
	});
});
