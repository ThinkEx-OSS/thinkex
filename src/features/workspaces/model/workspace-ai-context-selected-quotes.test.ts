import { describe, expect, it } from "vitest";

import { formatWorkspaceAiContextForPrompt } from "#/features/workspaces/model/workspace-ai-context-prompt";

describe("workspace AI context selected quotes", () => {
	it("includes selected text without allocating a citation ref", () => {
		const snapshot = {
			contentIncluded: false,
			openTabs: [],
			selectedItems: [],
			selectedQuotes: [
				{
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

		expect(prompt).toContain("Selected source text.");
		expect(prompt).not.toContain("[ref:");
		expect(prompt).not.toContain("wr_");
	});
});
