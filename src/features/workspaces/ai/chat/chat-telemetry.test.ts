import { describe, expect, it } from "vitest";

import { fitTelemetryContent } from "#/features/workspaces/ai/chat/chat-model";

describe("fitTelemetryContent", () => {
	it("passes an under-budget transcript through untouched", () => {
		const entries = [
			{ role: "user", content: "hi" },
			{ role: "assistant", content: "hello" },
		];

		expect(fitTelemetryContent(entries)).toEqual(entries);
	});

	it("drops oldest messages first and marks the omission", () => {
		const big = "x".repeat(250_000);
		const entries = [
			{ role: "user", content: big },
			{ role: "assistant", content: big },
			{ role: "user", content: big },
			{ role: "assistant", content: "the newest reply" },
		];

		const fitted = fitTelemetryContent(entries);

		expect(fitted[0]).toEqual({
			role: "system",
			content: "(2 earlier messages omitted from telemetry)",
		});
		expect(fitted.at(-1)).toEqual(entries.at(-1));
		expect(fitted).toHaveLength(3);
	});

	it("slices a lone over-budget entry, the compaction-prompt case", () => {
		const fitted = fitTelemetryContent([{ role: "user", content: "y".repeat(500_000) }]);
		const only = fitted[0] as { content: string };

		expect(fitted).toHaveLength(1);
		expect(only.content.endsWith("…(truncated)")).toBe(true);
		expect(only.content.length).toBeLessThan(410_000);
	});
});
