import { describe, expect, it } from "vitest";

import { asRecord, isRecord } from "#/lib/record";

describe("record guards", () => {
	it("accepts keyed objects without treating arrays as records", () => {
		const record = { value: 1 };

		expect(isRecord(record)).toBe(true);
		expect(asRecord(record)).toBe(record);
		expect(isRecord([])).toBe(false);
		expect(asRecord([])).toEqual({});
	});
});
