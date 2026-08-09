import { describe, expect, it } from "vitest";

import { workspaceThemeValues } from "#/features/workspaces/contracts";
import { DEFAULT_WORKSPACE_THEME } from "#/features/workspaces/defaults";
import {
	defaultWorkspaceTheme,
	filterWorkspaceThemeOptions,
	getWorkspaceThemeArt,
	getWorkspaceThemeArtByValue,
	resolveWorkspaceIdentity,
	resolveWorkspaceTheme,
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

describe("theme resolution", () => {
	it("keeps the contract enum and the catalogue in sync", () => {
		const catalogued = new Set(workspaceThemeOptions.map((theme) => theme.value));

		expect(workspaceThemeValues.filter((value) => !catalogued.has(value))).toEqual([]);
		expect(workspaceThemeValues).toHaveLength(workspaceThemeOptions.length);
	});

	it("reads the column and never guesses from the icon", () => {
		// Regression: art used to be inferred from the icon at render time while
		// the settings picker read the column, so a pre-theme workspace showed
		// Chemistry on its card and said "Default" in its picker. Migration 0005
		// wrote that inference into the column, so there is one answer now.
		expect(resolveWorkspaceTheme({ theme: "chemistry" }).value).toBe("chemistry");
		expect(getWorkspaceThemeArt({ theme: "chemistry" })).toBe(
			getWorkspaceThemeArtByValue("chemistry"),
		);
	});

	it("resolves a concrete theme for anything the column can hold", () => {
		expect(defaultWorkspaceTheme.value).toBe(DEFAULT_WORKSPACE_THEME);
		// Null only reaches here for a row written before 0005 on an unmigrated
		// database; a retired or stale value is already nulled by the mapper.
		expect(resolveWorkspaceTheme({ theme: null }).value).toBe(DEFAULT_WORKSPACE_THEME);
		expect(resolveWorkspaceTheme({}).value).toBe(DEFAULT_WORKSPACE_THEME);
		expect(resolveWorkspaceTheme({ theme: "retired-theme" }).value).toBe(DEFAULT_WORKSPACE_THEME);
	});
});

describe("identity vs artwork resolution", () => {
	it("does not repaint a pre-theme workspace's own colour", () => {
		// 0005 backfilled the theme column but deliberately left icon and colour
		// alone, so a workspace keeps the colour it chose until someone saves a
		// theme over it. Identity therefore still prefers the stored values.
		const identity = resolveWorkspaceIdentity({
			theme: null,
			icon: "flask-conical",
			color: "rose",
		});

		expect(identity.color).toBe("rose");
		expect(identity.icon).toBe("flask-conical");
	});

	it("lets an explicit theme override stored icon and colour", () => {
		const identity = resolveWorkspaceIdentity({
			theme: "chemistry",
			icon: "compass",
			color: "rose",
		});
		const chemistry = workspaceThemeOptions.find((theme) => theme.value === "chemistry");

		expect(identity.icon).toBe(chemistry?.icon);
		expect(identity.color).toBe(chemistry?.color);
	});
});
