import { describe, expect, it } from "vitest";

import { createFtsMatchExpression } from "#/features/workspaces/search/workspace-search-query";

describe("workspace search lexical matching", () => {
	it("requires every query token to match so lexical hits stay literal", () => {
		expect(createFtsMatchExpression("acme invoice 4417")).toBe(
			'"acme"* AND "invoice"* AND "4417"*',
		);
	});

	it("escapes embedded quotes and drops queries with no tokens", () => {
		expect(createFtsMatchExpression('say "hi"')).toBe('"say"* AND "hi"*');
		expect(createFtsMatchExpression("!?")).toBeNull();
	});
});
