import { describe, expect, it } from "vitest";

import { AI_TOOL_REGISTRY, getAiToolPresentation } from "#/features/workspaces/ai/ai-tool-registry";

describe("AI tool registry", () => {
	it("keeps model policy separate from UI presentation", () => {
		expect(AI_TOOL_REGISTRY.workspace_link_items).toMatchObject({
			model: { access: "write", codemode: false },
			ui: { visibility: "hidden" },
		});
		expect(AI_TOOL_REGISTRY.compute).toMatchObject({
			model: { access: "read", codemode: true },
			ui: { icon: "code", visibility: "visible" },
		});
	});

	it("keeps mutations out of Code Mode until calls have stable IDs", () => {
		const writeTools = Object.values(AI_TOOL_REGISTRY).filter(
			(definition) => definition.model.access === "write",
		);

		expect(writeTools.length).toBeGreaterThan(0);
		expect(writeTools.every((definition) => !definition.model.codemode)).toBe(true);
	});

	it("gives unknown connector tools a legible generic presentation", () => {
		expect(getAiToolPresentation("custom_lookup")).toEqual({
			icon: "web",
			title: "Custom lookup",
			visibility: "visible",
		});
	});
});
