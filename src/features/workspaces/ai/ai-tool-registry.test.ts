import { describe, expect, it } from "vitest";

import { AI_TOOL_REGISTRY, getAiToolPresentation } from "#/features/workspaces/ai/ai-tool-registry";

describe("AI tool registry", () => {
	it("keeps model policy separate from UI presentation", () => {
		expect(AI_TOOL_REGISTRY.workspace_link_items).toMatchObject({
			model: { access: "write" },
			ui: { visibility: "hidden" },
		});
		expect(AI_TOOL_REGISTRY.web_fetch).toMatchObject({
			model: { access: "read" },
			ui: { icon: "web", visibility: "visible" },
		});
	});

	it("gives unknown connector tools a legible generic presentation", () => {
		expect(getAiToolPresentation("mystery_tool")).toMatchObject({
			title: expect.any(String),
		});
	});
});
