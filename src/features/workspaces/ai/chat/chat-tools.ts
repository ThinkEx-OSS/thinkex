import type { ToolSet } from "ai";

import type { AIThreadContext } from "#/features/workspaces/ai/ai-thread-metadata";
import { requireAiToolDefinition } from "#/features/workspaces/ai/ai-tool-registry";
import { createAIThreadResearchTools } from "#/features/workspaces/ai/research-tools";
import { createAIThreadSkillTools } from "#/features/workspaces/ai/skill-tools";
import { createAIThreadTimeTools } from "#/features/workspaces/ai/time-tools";
import { createAIThreadWebTools } from "#/features/workspaces/ai/web-tools";
import { createAIThreadWorkspaceTools } from "#/features/workspaces/ai/workspace-tools";

// Tool surface for the Postgres chat path: the same AI SDK tool modules the
// Think implementation uses, assembled directly (no Think workspace/sandbox,
// no Code Mode orchestration — tools are mounted plainly). Write tools are
// filtered per turn by the caller's membership capabilities via the registry's
// access policy, mirroring getActiveToolNames in ai-thread-runtime.
export function createAiChatTools(input: {
	env: Cloudflare.Env;
	threadContext: AIThreadContext;
	canMutate: boolean;
	timeZone?: string;
}): ToolSet {
	const tools: ToolSet = {
		...createAIThreadWebTools(input.env),
		...createAIThreadResearchTools(input.env),
		...createAIThreadTimeTools({ defaultTimeZone: input.timeZone }),
		...createAIThreadSkillTools(),
		...createAIThreadWorkspaceTools({
			env: input.env,
			threadContext: input.threadContext,
		}),
	};

	if (input.canMutate) {
		return tools;
	}

	return Object.fromEntries(
		Object.entries(tools).filter(([name]) => requireAiToolDefinition(name).model.access === "read"),
	) as ToolSet;
}
