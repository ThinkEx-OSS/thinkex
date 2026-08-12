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

	it("keeps token order free and ranks closer names first", () => {
		const ranked = rankNameSearch("notes meet", ["Meeting Notes", "Notes", "Unrelated"], (name) => [
			name,
		]);
		expect(ranked[0]).toBe("Meeting Notes");
		expect(ranked).not.toContain("Unrelated");
	});
});
