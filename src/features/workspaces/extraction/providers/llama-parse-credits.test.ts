import { describe, expect, it } from "vitest";

import { getLlamaParseDerivedCredits } from "#/features/workspaces/extraction/providers/llama-parse-credits";

function createPages(total: number, optimized: number) {
	return Array.from({ length: total }, (_, index) => ({ cost_optimized: index < optimized }));
}

describe("getLlamaParseDerivedCredits", () => {
	it("bills every page at the requested tier when nothing was optimized", () => {
		expect(getLlamaParseDerivedCredits({ pages: createPages(9, 0) }, "agentic")).toBe(90);
	});

	it("bills optimizer-downgraded pages at the cost_effective rate", () => {
		// The production 1,527-page run: 717 pages downgraded, 810 left on agentic.
		expect(getLlamaParseDerivedCredits({ pages: createPages(1527, 717) }, "agentic")).toBe(
			717 * 3 + 810 * 10,
		);
	});

	it("prices each tier from its own rate", () => {
		expect(getLlamaParseDerivedCredits({ pages: createPages(2, 0) }, "cost_effective")).toBe(6);
		expect(getLlamaParseDerivedCredits({ pages: createPages(2, 0) }, "agentic_plus")).toBe(90);
	});

	it("treats a missing cost_optimized flag as not downgraded", () => {
		expect(getLlamaParseDerivedCredits({ pages: [{}, {}] }, "agentic")).toBe(20);
	});

	it("returns null when there is no per-page breakdown to price", () => {
		expect(getLlamaParseDerivedCredits({}, "agentic")).toBeNull();
		expect(getLlamaParseDerivedCredits({ pages: [] }, "agentic")).toBeNull();
		expect(getLlamaParseDerivedCredits(null, "agentic")).toBeNull();
	});
});
