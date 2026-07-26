import { describe, expect, it } from "vitest";

import {
	formatWorkspaceAiContextForPrompt,
	getWorkspaceAiContextReferenceRecords,
} from "#/features/workspaces/model/workspace-ai-context-prompt";

describe("workspace AI context citations", () => {
	it("makes a selected workspace quote citable without exposing its location", () => {
		const snapshot = {
			contentIncluded: false,
			openTabs: [],
			selectedItems: [],
			selectedQuotes: [
				{
					citation: {
						location: { itemId: "document-1", kind: "item", version: 1 },
						ref: "wr_AAAAAAAA",
					},
					label: "Document selection",
					order: 1,
					source: { kind: "document-selection" },
					text: "Selected source text.",
				},
			],
			view: {
				presentation: { mode: "standard" },
			},
			workspace: {
				name: "Course",
			},
		};
		const prompt = formatWorkspaceAiContextForPrompt(snapshot);

		expect(prompt).toContain("[ref: wr_AAAAAAAA]");
		expect(prompt).toContain("Selected source text.");
		expect(prompt).not.toContain("document-1");
		expect(getWorkspaceAiContextReferenceRecords(snapshot)).toEqual([
			{
				location: { itemId: "document-1", kind: "item", version: 1 },
				ref: "wr_AAAAAAAA",
			},
		]);
	});
});
