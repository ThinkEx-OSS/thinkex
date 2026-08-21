import type { ToolSet } from "ai";

import type { AIThreadContext } from "#/features/workspaces/ai/ai-thread-metadata";
import { requireAiToolDefinition } from "#/features/workspaces/ai/ai-tool-registry";
import type { AiCodemodeActivityListener } from "#/features/workspaces/ai/codemode-tool";
import { createAiChatCodemodeTool } from "#/features/workspaces/ai/codemode-tool";
import { createAIThreadImageTools } from "#/features/workspaces/ai/image-tools";
import { createAIThreadQuestionTools } from "#/features/workspaces/ai/question-tools";
import { createAIThreadResearchTools } from "#/features/workspaces/ai/research-tools";
import { createAIThreadSkillTools } from "#/features/workspaces/ai/skill-tools";
import { createAIThreadTimeTools } from "#/features/workspaces/ai/time-tools";
import { createAIThreadWebTools } from "#/features/workspaces/ai/web-tools";
import { createAIThreadWorkspaceTools } from "#/features/workspaces/ai/workspace-tools";

// Tool surface for the Postgres chat path. Write tools are filtered per turn
// by the caller's membership capabilities via the registry's access policy,
// mirroring getActiveToolNames in ai-thread-runtime. The orchestrate (Code
// Mode) tool is built LAST, from the already-filtered set, so generated code
// can never reach a tool the turn itself couldn't call directly.
export function createAiChatTools(input: {
	env: Cloudflare.Env;
	threadContext: AIThreadContext;
	canMutate: boolean;
	timeZone?: string;
	onCodemodeActivity?: AiCodemodeActivityListener;
}): ToolSet {
	const tools: ToolSet = {
		...createAIThreadWebTools(input.env),
		...createAIThreadImageTools({ env: input.env, threadContext: input.threadContext }),
		...createAIThreadResearchTools(input.env),
		...createAIThreadTimeTools({ defaultTimeZone: input.timeZone }),
		...createAIThreadSkillTools(),
		...createAIThreadWorkspaceTools({
			env: input.env,
			threadContext: input.threadContext,
		}),
	};

	const allowed = input.canMutate
		? tools
		: (Object.fromEntries(
				Object.entries(tools).filter(
					([name]) => requireAiToolDefinition(name).model.access === "read",
				),
			) as ToolSet);

	return {
		...allowed,
		orchestrate: createAiChatCodemodeTool({
			env: input.env,
			tools: allowed,
			...(input.onCodemodeActivity ? { onActivity: input.onCodemodeActivity } : {}),
		}),
		// Built outside `allowed`, so Code Mode can never reach it: asking ends
		// the turn, and a generated program that "asks" mid-run would just get a
		// receipt back and carry on past the answer it was waiting for.
		...createAIThreadQuestionTools(),
	};
}
