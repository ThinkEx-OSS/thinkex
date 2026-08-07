import { describe, expect, it } from "vitest";

import { buildLlamaParseJobRequest } from "#/features/workspaces/extraction/providers/llama-parse";

describe("buildLlamaParseJobRequest", () => {
	it.each(["agentic", "agentic_plus"] as const)("enables the cost optimizer on %s", (tier) => {
		expect(buildLlamaParseJobRequest({ fileId: "f", tier }).processing_options).toEqual({
			cost_optimizer: { enable: true },
		});
	});

	// LlamaParse rejects cost_optimizer + cost_effective with a 422 — sending it
	// unconditionally once made every cost_effective parse fail outright.
	it("omits the cost optimizer on cost_effective", () => {
		expect(
			buildLlamaParseJobRequest({ fileId: "f", tier: "cost_effective" }).processing_options,
		).toEqual({});
	});
});
