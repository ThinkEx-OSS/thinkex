import { describe, expect, it } from "vitest";

import { ByteRangeNotSatisfiableError, parseByteRange } from "#/lib/http/byte-range";

describe("HTTP byte ranges", () => {
	it("parses bounded, open-ended, and suffix ranges", () => {
		expect(parseByteRange("bytes=10-19", 100)).toEqual({ offset: 10, length: 10 });
		expect(parseByteRange("bytes=90-", 100)).toEqual({ offset: 90, length: 10 });
		expect(parseByteRange("bytes=-25", 100)).toEqual({ suffix: 25 });
	});

	it("clamps ranges to the available object", () => {
		expect(parseByteRange("bytes=90-200", 100)).toEqual({ offset: 90, length: 10 });
		expect(parseByteRange("bytes=-200", 100)).toEqual({ suffix: 100 });
	});

	it.each(["bytes=100-", "bytes=20-10", "bytes=0-1,3-4", "items=0-1", "bytes=-0"])(
		"rejects an unsatisfiable range: %s",
		(value) => {
			expect(() => parseByteRange(value, 100)).toThrow(ByteRangeNotSatisfiableError);
		},
	);
});
