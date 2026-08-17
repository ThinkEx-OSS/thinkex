import { describe, expect, it } from "vitest";

import { createAIThreadSkillTools } from "#/features/workspaces/ai/skill-tools";

describe("AI thread skill tools", () => {
	it("lists every bundled skill in the activate_skill description", () => {
		const { activate_skill } = createAIThreadSkillTools();

		expect(activate_skill?.description).toContain("widget-authoring:");
	});

	it("activates a skill with its instructions and bundled references inline", async () => {
		const tool = createAIThreadSkillTools().activate_skill;
		if (!tool || typeof tool.execute !== "function") {
			throw new Error("activate_skill must be an executable tool");
		}

		const result = (await tool.execute({ name: "widget-authoring" }, {
			toolCallId: "call-1",
			messages: [],
		} as never)) as { name: string; instructions: string };

		expect(result.name).toBe("widget-authoring");
		// The body is the contract, not the raw file: frontmatter stripped.
		expect(result.instructions.startsWith("# Author ThinkEx widgets")).toBe(true);
		expect(result.instructions).toContain("widget_script_syntax_error");
		// Both references ride along, labeled by path.
		expect(result.instructions).toContain("# Bundled reference: references/starter.md");
		expect(result.instructions).toContain("# Bundled reference: references/canvas.md");
	});
});
