import { describe, expect, it } from "vitest";

import {
	filterWorkspaceThemeOptions,
	workspaceThemeOptions,
} from "#/features/workspaces/model/workspace-themes";

const labels = (query: string, group: string | null = null) =>
	filterWorkspaceThemeOptions(query, group).map((theme) => theme.label);

describe("theme search", () => {
	it("ranks an exact label match first", () => {
		expect(labels("chemistry")[0]).toBe("Chemistry");
	});

	it("expands umbrella terms to the whole family", () => {
		const results = labels("math");

		expect(results[0]).toBe("Mathematics");
		expect(results).toContain("Geometry");
		expect(results).toContain("Statistics");
	});

	it("finds a theme by an object it depicts", () => {
		// "flask" appears only in Chemistry's prop description, never its label.
		expect(labels("flask")).toContain("Chemistry");
		expect(labels("passport")).toContain("World Studies");
	});

	it("finds a theme through its icon's aliases", () => {
		// "genome" is an alias of the dna icon, not text on the theme itself.
		expect(labels("genome")).toContain("Genetics");
	});

	it("matches partial words", () => {
		expect(labels("chem")).toContain("Chemistry");
	});

	it("requires every token to match", () => {
		expect(labels("chemistry zzzz")).toHaveLength(0);
	});

	it("respects the group filter", () => {
		const results = filterWorkspaceThemeOptions("", "Science");

		expect(results.length).toBeGreaterThan(0);
		expect(results.every((theme) => theme.group === "Science")).toBe(true);
	});

	it("never offers the default theme as a pickable option", () => {
		expect(labels("")).not.toContain("Default");
		expect(workspaceThemeOptions.some((theme) => theme.group === "Default")).toBe(true);
	});
});
