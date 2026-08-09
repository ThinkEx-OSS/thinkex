import { describe, expect, it } from "vitest";

import { workspaceThemeValues } from "#/features/workspaces/contracts";
import {
	DEFAULT_WORKSPACE_THEME,
	defaultWorkspaceTheme,
	filterWorkspaceThemeOptions,
	getWorkspaceThemeArt,
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

	it("resolves an explicit default rather than falling back to the icon", () => {
		// Regression: picking "Default" used to store null, which then derived art
		// from the workspace's retained icon and put the previous theme back.
		expect(defaultWorkspaceTheme.value).toBe(DEFAULT_WORKSPACE_THEME);
		expect(getWorkspaceThemeArt({ theme: DEFAULT_WORKSPACE_THEME, icon: "flask-conical" })).toBe(
			getWorkspaceThemeArt({ theme: DEFAULT_WORKSPACE_THEME, icon: null }),
		);
	});

	it("derives art from the icon only when no theme was ever chosen", () => {
		const derived = getWorkspaceThemeArt({ theme: null, icon: "flask-conical" });

		expect(derived).toBe(getWorkspaceThemeArt({ theme: "chemistry", icon: null }));
		expect(derived).not.toBe(getWorkspaceThemeArt({ theme: DEFAULT_WORKSPACE_THEME, icon: null }));
	});

	it("names the same theme the artwork came from", () => {
		// Regression: the settings picker read `workspace.theme` directly, so a
		// workspace that predates themes said "Default" while its card showed the
		// icon-derived illustration.
		const workspace = { theme: null, icon: "flask-conical" };

		expect(resolveWorkspaceTheme(workspace).value).toBe("chemistry");
		expect(getWorkspaceThemeArt(workspace)).toBe(
			getWorkspaceThemeArt({ theme: resolveWorkspaceTheme(workspace).value, icon: null }),
		);
	});

	it("resolves to a concrete theme for every input", () => {
		expect(resolveWorkspaceTheme({}).value).toBe(DEFAULT_WORKSPACE_THEME);
		expect(resolveWorkspaceTheme({ theme: "retired-theme" }).value).toBe(DEFAULT_WORKSPACE_THEME);
		expect(resolveWorkspaceTheme({ theme: null, icon: "unknown-icon" }).value).toBe(
			DEFAULT_WORKSPACE_THEME,
		);
	});

	it("treats the generic fallback icon as no signal", () => {
		// `compass` is the app-wide default icon, so it must not imply a subject.
		expect(getWorkspaceThemeArt({ theme: null, icon: "compass" })).toBe(
			getWorkspaceThemeArt({ theme: DEFAULT_WORKSPACE_THEME, icon: null }),
		);
	});
});

describe("identity vs artwork resolution", () => {
	it("does not repaint a pre-theme workspace's own colour", () => {
		// The two rules deliberately differ: artwork may be inferred from the
		// icon, identity may not, or upgrading would silently change colours.
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
