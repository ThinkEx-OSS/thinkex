import { describe, expect, it } from "vitest";

import { rankNameSearch, scoreNameSearch } from "#/lib/name-search";

describe("name search", () => {
	it("treats spaces and punctuation as optional in names", () => {
		expect(scoreNameSearch("to do", ["todo"])).toBeGreaterThan(0);
		expect(scoreNameSearch("to-do", ["todo"])).toBeGreaterThan(0);
		expect(scoreNameSearch("todo", ["To Do"])).toBeGreaterThan(0);
		expect(scoreNameSearch("td", ["To Do"])).toBeGreaterThan(0);
	});

	it("matches type aliases and ranks the name higher", () => {
		const byType = scoreNameSearch("pdf", ["report", "PDF"]);
		const byName = scoreNameSearch("pdf", ["Q4 PDF"]);
		expect(byType).toBeGreaterThan(0);
		expect(byName).toBeGreaterThan(byType);
	});

	it("ranks an exact name ahead of a longer name that contains it", () => {
		expect(scoreNameSearch("foo", ["foo"])).toBeGreaterThan(scoreNameSearch("foo", ["foo bar"]));
	});

	it("keeps token order free and ranks closer names first", () => {
		const ranked = rankNameSearch("notes meet", ["Meeting Notes", "Notes", "Unrelated"], (name) => [
			name,
		]);
		expect(ranked[0]).toBe("Meeting Notes");
		expect(ranked).not.toContain("Unrelated");
	});

	it("requires every query token to match", () => {
		expect(scoreNameSearch("todo zzzz", ["Product Todo"])).toBe(0);
	});

	it("does not match letters scattered across unrelated words", () => {
		expect(scoreNameSearch("todo", ["complaints from notebooklm and other app users"])).toBe(0);
	});

	it("ranks a real todo name above other documents", () => {
		const ranked = rankNameSearch(
			"todo",
			["complaints from notebooklm and other app users", "Product Todo", "Todo"],
			(name) => [name],
		);
		expect(ranked).toEqual(["Todo", "Product Todo"]);
	});

	it("still matches a compact subsequence that starts on a word", () => {
		expect(scoreNameSearch("wrep", ["Write Report"])).toBeGreaterThan(0);
		expect(scoreNameSearch("wr", ["Write Report"])).toBeGreaterThan(0);
	});

	it("does not match a subsequence that starts mid-word", () => {
		expect(scoreNameSearch("ato", ["Catalog"])).toBe(0);
	});

	it("does not match a word-start subsequence with a long gap", () => {
		expect(scoreNameSearch("todo", ["Technical documentation"])).toBe(0);
	});
});
