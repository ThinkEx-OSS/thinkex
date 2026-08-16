import type { ToolSet } from "ai";
import { z } from "zod";

import { defineAIThreadTool } from "#/features/workspaces/ai/ai-thread-tool";
import widgetAuthoringCanvas from "#/features/workspaces/ai/skills/widget-authoring/references/canvas.md?raw";
import widgetAuthoringStarter from "#/features/workspaces/ai/skills/widget-authoring/references/starter.md?raw";
import widgetAuthoringSkill from "#/features/workspaces/ai/skills/widget-authoring/SKILL.md?raw";

// Skills are Agent Skills-format markdown (SKILL.md with name/description
// frontmatter) bundled at build time — the Worker has no filesystem to
// discover them from at runtime. Pi and OpenCode list available skills in the
// system prompt and let the model pull the body on demand; we carry the
// listing in `activate_skill`'s tool description instead, which reaches the
// model just as reliably without threading skill state into the prompt
// builder. Reference files are appended to the activated body: they are tiny,
// and a separate read tool would cost a definition on every request to save
// ~1k tokens on the rare activation. Re-split if a skill ever ships large
// references.
const BUNDLED_SKILLS = {
	"widget-authoring": parseSkillMarkdown(widgetAuthoringSkill, {
		"references/canvas.md": widgetAuthoringCanvas,
		"references/starter.md": widgetAuthoringStarter,
	}),
} as const;

const skillNameSchema = z
	.enum(Object.keys(BUNDLED_SKILLS) as [SkillName])
	.describe("The skill to load.");

type SkillName = keyof typeof BUNDLED_SKILLS;

interface BundledSkill {
	description: string;
	instructions: string;
}

export function createAIThreadSkillTools(): ToolSet {
	return {
		activate_skill: defineAIThreadTool({
			description: [
				"Load a skill's full instructions when the task matches its description, before doing that work. Available skills:",
				...Object.entries(BUNDLED_SKILLS).map(([name, skill]) => `- ${name}: ${skill.description}`),
			].join("\n"),
			inputSchema: z.object({ name: skillNameSchema }),
			outputSchema: z.object({ name: z.string(), instructions: z.string() }),
			execute: ({ name }) => ({
				name,
				instructions: BUNDLED_SKILLS[name].instructions,
			}),
		}),
	};
}

function parseSkillMarkdown(raw: string, resources: Record<string, string>): BundledSkill {
	const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(raw);
	const description = frontmatter && /^description:\s*(.+)$/m.exec(frontmatter[1])?.[1]?.trim();
	if (!frontmatter || !description) {
		throw new Error("Skill markdown must open with frontmatter containing a description");
	}

	const body = raw.slice(frontmatter[0].length).trim();
	const referenceSections = Object.entries(resources).map(
		([path, content]) => `# Bundled reference: ${path}\n\n${content.trim()}`,
	);

	return {
		description,
		instructions: [body, ...referenceSections].join("\n\n---\n\n"),
	};
}
