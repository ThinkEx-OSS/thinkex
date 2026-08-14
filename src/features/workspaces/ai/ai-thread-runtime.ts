import { createWorkspaceStateBackend, type WorkspaceFsLike } from "@cloudflare/shell";
import type { WorkspaceLike } from "@cloudflare/think/tools/workspace";
import { createWorkspaceTools } from "@cloudflare/think/tools/workspace";
import type { LanguageModel, ToolSet, UIMessage } from "ai";
import {
	addToolInputExamplesMiddleware,
	createGateway,
	generateText,
	Output,
	wrapLanguageModel,
} from "ai";
import { z } from "zod";

import type {
	AIThreadContext,
	AIThreadPromptScope,
} from "#/features/workspaces/ai/ai-thread-metadata";
import type { WorkspaceReferenceRecord } from "#/features/workspaces/locations/workspace-location";
import {
	requireAiToolDefinition,
	type AiToolModelPolicy,
} from "#/features/workspaces/ai/ai-tool-registry";
import {
	getAIThreadTitleGatewayRoutingOptions,
	getWorkspaceAiGatewayRoutingOptions,
} from "#/features/workspaces/ai/ai-gateway-routing";
import {
	DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID,
	getWorkspaceAiChatModel,
	type resolveWorkspaceAiChatModelId,
} from "#/features/workspaces/ai/models";
import { createAIThreadCodeRunTools } from "#/features/workspaces/ai/code-run-tools";
import {
	AI_THREAD_BROWSER_POLICY,
	createAIThreadBrowserHandoffTool,
	AI_THREAD_BROWSER_HANDOFF_TOOL_NAME,
} from "#/features/workspaces/ai/ai-thread-browser";
import { createAIThreadOrchestrationTool } from "#/features/workspaces/ai/ai-thread-orchestration";
import { createAIThreadResearchTools } from "#/features/workspaces/ai/research-tools";
import { createAIThreadTimeTools } from "#/features/workspaces/ai/time-tools";
import { createAIThreadWebTools } from "#/features/workspaces/ai/web-tools";
import { createAIThreadWorkspaceTools } from "#/features/workspaces/ai/workspace-tools";
import { formatWorkspaceAiContextForPrompt } from "#/features/workspaces/model/workspace-ai-context-prompt";

const thinkPromptSectionDivider = "══════════════════════════════════════════════";

const AI_THREAD_TITLE_GATEWAY_MODEL = "google/gemini-2.5-flash-lite";

type WorkspaceAiProviderOptions = NonNullable<
	Parameters<typeof generateText>[0]["providerOptions"]
>;

const THINK_CAPABILITY_BLOCK_MARKER = "You are running inside a Think agent.";
const AI_THREAD_ORCHESTRATE_TOOL_NAME = "orchestrate";

const AI_THREAD_VIEW_ONLY_WORKSPACE_LINE =
	"- Workspace access: view-only. Do not create, rename, edit, move, or delete workspace items.";
const AI_THREAD_WORKSPACE_CITATION_PROMPT = [
	"# Workspace Citations",
	"- Workspace reads may include short refs such as `wr_7Kp2Qa9x`.",
	'- After a quote or important claim supported by a ref, place an empty `<citation ref="wr_7Kp2Qa9x"></citation>` immediately after that text.',
	"- Copy refs exactly. Never invent, alter, reuse a ref for different material, or cite web/unsupported claims with workspace tags. Omit the tag when no ref was provided.",
	"- Cite selectively: important claims, conclusions, summaries, and direct quotes, not every sentence or common knowledge.",
	"- When you mention a newly created workspace item and creation returned a ref, cite the item name with that ref.",
	"- Workspace names and paths are not URLs. Never build Markdown links to workspace items from a name, path, or app origin.",
].join("\n");
const WORKSPACE_FS_METHOD_NAMES = [
	"readFile",
	"readFileBytes",
	"writeFile",
	"writeFileBytes",
	"appendFile",
	"exists",
	"stat",
	"lstat",
	"mkdir",
	"readDir",
	"rm",
	"cp",
	"mv",
	"symlink",
	"readlink",
	"glob",
] as const satisfies readonly (keyof WorkspaceFsLike)[];

export function createAIThreadTools(input: {
	env: Cloudflare.Env;
	threadId: string;
	workspace: WorkspaceLike;
	getThreadContext: () => Promise<AIThreadContext | null>;
	onWorkspaceReferences?: (records: readonly WorkspaceReferenceRecord[]) => void;
	resolveWorkspaceReferences?: (refs: readonly string[]) => Promise<WorkspaceReferenceRecord[]>;
	timeZone?: string;
}): ToolSet {
	return createAIThreadToolCatalog(input).tools;
}

export function createAIThreadTurnToolConfig(input: {
	env: Cloudflare.Env;
	ctx: DurableObjectState;
	threadId: string;
	workspace: WorkspaceLike;
	getThreadContext: () => Promise<AIThreadContext | null>;
	canMutate: boolean;
	onOrchestrationRuntime?: Parameters<typeof createAIThreadOrchestrationTool>[0]["onRuntime"];
	onWorkspaceReferences?: (records: readonly WorkspaceReferenceRecord[]) => void;
	resolveWorkspaceReferences?: (refs: readonly string[]) => Promise<WorkspaceReferenceRecord[]>;
	timeZone?: string;
}) {
	const toolCatalog = createAIThreadToolCatalog(input);
	const workspaceFs = isWorkspaceFsLike(input.workspace) ? input.workspace : undefined;
	const state = workspaceFs ? createWorkspaceStateBackend(workspaceFs) : undefined;
	const hasState = workspaceFs !== undefined;
	const activeToolNames = toolCatalog.getActiveToolNames(input.canMutate);
	const codemodeTools = {
		...toolCatalog.getCodemodeTools(input.canMutate),
		[AI_THREAD_BROWSER_HANDOFF_TOOL_NAME]: createAIThreadBrowserHandoffTool(),
	} satisfies ToolSet;

	return {
		activeTools: activeToolNames,
		tools: {
			orchestrate: createAIThreadOrchestrationTool({
				browser: input.env.BROWSER,
				ctx: input.ctx,
				loader: input.env.LOADER,
				state,
				tools: codemodeTools,
				name: AI_THREAD_ORCHESTRATE_TOOL_NAME,
				onRuntime: input.onOrchestrationRuntime,
				description: getAIThreadOrchestrateDescription(hasState),
			}),
		} satisfies ToolSet,
	};
}

interface AIThreadToolEntry extends AiToolModelPolicy {
	name: string;
	tool: ToolSet[string];
}

function createAIThreadToolCatalog(input: {
	env: Cloudflare.Env;
	threadId: string;
	workspace: WorkspaceLike;
	getThreadContext: () => Promise<AIThreadContext | null>;
	onWorkspaceReferences?: (records: readonly WorkspaceReferenceRecord[]) => void;
	resolveWorkspaceReferences?: (refs: readonly string[]) => Promise<WorkspaceReferenceRecord[]>;
	timeZone?: string;
}) {
	const sandboxTools = createSandboxTools(input.workspace);
	const codeRunTools = createAIThreadCodeRunTools({
		env: input.env,
		sandboxId: getAIThreadComputeSandboxId(input.threadId),
	});
	const webTools = createAIThreadWebTools(input.env);
	const researchTools = createAIThreadResearchTools(input.env);
	const timeTools = createAIThreadTimeTools({
		defaultTimeZone: input.timeZone,
	});
	const workspaceTools = createAIThreadWorkspaceTools({
		env: input.env,
		getThreadContext: input.getThreadContext,
		onWorkspaceReferences: input.onWorkspaceReferences,
		resolveWorkspaceReferences: input.resolveWorkspaceReferences,
	});
	const entries: AIThreadToolEntry[] = [];

	addAIThreadToolEntries(entries, sandboxTools);
	addAIThreadToolEntries(entries, codeRunTools);
	addAIThreadToolEntries(entries, webTools);
	addAIThreadToolEntries(entries, researchTools);
	addAIThreadToolEntries(entries, timeTools);
	addAIThreadToolEntries(entries, workspaceTools);

	return {
		tools: createAIThreadToolSet(entries),
		getActiveToolNames(canMutate: boolean) {
			const names: string[] = [];
			for (const entry of entries) {
				if (canMutate || entry.access === "read") {
					names.push(entry.name);
				}
			}

			return names.includes("sandbox_bash")
				? [
						"sandbox_bash",
						AI_THREAD_ORCHESTRATE_TOOL_NAME,
						...names.filter((name) => name !== "sandbox_bash"),
					]
				: [AI_THREAD_ORCHESTRATE_TOOL_NAME, ...names];
		},
		getCodemodeTools(canMutate: boolean) {
			return createAIThreadToolSet(
				entries.filter((entry) => entry.codemode && (canMutate || entry.access === "read")),
			);
		},
	};
}

function getAIThreadComputeSandboxId(threadId: string) {
	const normalized = threadId
		.toLowerCase()
		.replaceAll(/[^a-z0-9-]/g, "-")
		.replaceAll(/-+/g, "-")
		.replaceAll(/^-|-$/g, "");

	return `ai-${(normalized || "thread").slice(0, 60)}`;
}

function createSandboxTools(workspace: WorkspaceLike): ToolSet {
	const tools = createWorkspaceTools(workspace);
	const sandboxTools: ToolSet = {};

	if (tools.bash) {
		// v7 typed description as string | ((options) => string) — the widened
		// tool union in ToolSet does not narrow the intersection cleanly, so
		// cast the override object back to the runtime tool shape.
		sandboxTools.sandbox_bash = {
			...tools.bash,
			description:
				"Run a sandboxed Bash script against private sandbox files. Use this for shell-style scratch work inside the assistant sandbox only. This does not run against the actual ThinkEx workspace.",
		} as ToolSet[string];
	}

	return sandboxTools;
}

function getAIThreadOrchestrateDescription(hasState: boolean) {
	const stateLine = hasState
		? "- `state.*` is the private assistant sandbox filesystem for scratch files and directories only. Nothing in `state.*` becomes a real ThinkEx workspace item."
		: "- `state.*` is unavailable in this runtime. Use `tools.*` for real workspace, web, and research operations.";
	const workflowLine = hasState
		? "3. Call the method shown by the docs, for example `await tools.workspace_list_items(args)` or `await state.readFile(args)`."
		: "3. Call the method shown by the docs, for example `await tools.workspace_list_items(args)`.";
	const globalsLine = hasState
		? "- The only globals are `state`, `tools`, `cdp`, and `codemode` plus standard JavaScript. There is no `host`, `fs`, `require`, `process`, or Node.js API."
		: "- The only globals are `tools`, `cdp`, and `codemode` plus standard JavaScript. There is no `host`, `fs`, `require`, `process`, or Node.js API.";

	return [
		"Orchestrate multi-step work by running JavaScript in a private assistant sandbox with access to ThinkEx connector SDKs.",
		"",
		"## Boundaries",
		"",
		stateLine,
		"- `tools.*` exposes ThinkEx workspace reads and mutations plus web, research, and time operations.",
		"- `tools.compute` executes private Python for calculations, data analysis, and charts.",
		"- `cdp.*` controls one task-scoped browser session through the Chrome DevTools Protocol.",
		"",
		"## Workflow",
		"",
		'1. `const matches = await codemode.search("short intent phrase");`',
		"2. `const docs = await codemode.describe(matches.results[0].path);`",
		workflowLine,
		"",
		"## Rules",
		"",
		globalsLine,
		"- Never guess method names. If you have not used a connector method in this conversation, run a discovery pass first.",
		'- `codemode.describe("tools.workspace_list_items")` or the path returned by search gives TypeScript type declarations.',
		"- Use `codemode.step(name, fn)` for nondeterministic work outside connector calls.",
		"- Some methods may require approval. If the run pauses, tell the user what is pending and wait. Do not re-issue the code.",
		"- Keep non-connector logic deterministic so resume can replay it.",
		...AI_THREAD_BROWSER_POLICY.map((instruction) => `- ${instruction}`),
		"- Do not use `fetch`. Use connector SDKs.",
		"",
		"## Snippets",
		"",
		'- Browser navigation: `const created = await cdp.send({ method: "Target.createTarget", params: { url } }); const { sessionId } = await cdp.attachToTarget({ targetId: created.targetId }); const page = await cdp.send({ method: "Runtime.evaluate", params: { expression: "({ readyState: document.readyState, title: document.title, url: location.href })", returnByValue: true }, sessionId });`',
		'- `codemode.run("name", input)` runs a saved snippet.',
		"- If a script may be reused later, write it as `async (input) => { ... }`.",
	].join("\n");
}

function isWorkspaceFsLike(workspace: WorkspaceLike): workspace is WorkspaceFsLike {
	const candidate = workspace as Partial<
		Record<(typeof WORKSPACE_FS_METHOD_NAMES)[number], unknown>
	>;

	return WORKSPACE_FS_METHOD_NAMES.every((method) => typeof candidate[method] === "function");
}

function addAIThreadToolEntries(entries: AIThreadToolEntry[], tools: ToolSet) {
	for (const [name, tool] of Object.entries(tools)) {
		if (!tool) {
			continue;
		}

		entries.push({
			...requireAiToolDefinition(name).model,
			name,
			tool,
		});
	}
}

function createAIThreadToolSet(entries: AIThreadToolEntry[]): ToolSet {
	return Object.fromEntries(entries.map((entry) => [entry.name, entry.tool])) as ToolSet;
}

export function getWorkspaceAiLanguageModel(
	modelId: ReturnType<typeof resolveWorkspaceAiChatModelId>,
	env: Cloudflare.Env,
	_sessionAffinity: string,
): LanguageModel {
	return getWorkspaceAiLanguageModelForGatewayModel(getWorkspaceAiChatModel(modelId), env);
}

function getWorkspaceAiLanguageModelForGatewayModel(
	gatewayModel: string,
	env: Cloudflare.Env,
): LanguageModel {
	const gateway = createGateway({
		apiKey: getVercelAiGatewayApiKey(env),
	});

	return wrapLanguageModel({
		model: gateway(gatewayModel),
		middleware: addToolInputExamplesMiddleware({
			prefix: "Valid input examples:",
		}),
	});
}

function getWorkspaceAiGatewayTransportOptions() {
	return {
		caching: "auto" as const,
		// Buy the fast lane where it exists. The gateway only forwards a tier to
		// OpenAI, Google AI Studio, and Vertex, so this is a no-op on the Claude
		// primaries and moves the models we actually default to (`auto`/luna, the
		// Gemini pair, the nano/flash-lite title legs). It is a hint, never a
		// promise: an unsupported model ignores it, and a provider that is out of
		// priority capacity silently downgrades to standard and bills standard.
		// Priority runs ~1.8-2x standard token price when it *is* granted, which
		// the `cost` ladder in models.ts does not account for — read
		// `service_tier` in PostHog before trusting those multipliers, since a
		// missing value means we paid standard and got standard.
		serviceTier: "priority" as const,
		// Time-to-first-token budget before a BYOK leg is abandoned for the next
		// provider — and eventually for Vercel's own credits. A flat 8s evicted
		// healthy requests: 37% of gemini-3.1-pro steps and 29% of sonnet steps
		// exceed it, because reasoning happens before the first token. Sized per
		// provider off measured p90/p99 TTFT of the slowest model each one serves.
		providerTimeouts: {
			byok: {
				anthropic: 20_000,
				azure: 15_000,
				openai: 15_000,
				vertex: 30_000,
			},
		},
	};
}

export function getWorkspaceAiGatewayProviderOptions(input?: {
	modelId?: ReturnType<typeof resolveWorkspaceAiChatModelId>;
	thread?: AIThreadContext;
	tags?: string[];
}): WorkspaceAiProviderOptions {
	const modelId = input?.modelId ?? DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID;
	const tags = [
		"app:thinkex",
		"feature:workspace-chat",
		`model:${modelId}`,
		input?.thread ? `workspace:${input.thread.workspaceId}` : undefined,
		input?.thread ? (input.thread.promptScope.canMutate ? "mode:mutate" : "mode:view") : undefined,
		...(input?.tags ?? []),
	].filter((tag): tag is string => Boolean(tag));

	return {
		gateway: {
			...getWorkspaceAiGatewayTransportOptions(),
			...getWorkspaceAiGatewayRoutingOptions(modelId),
			tags,
			...(input?.thread ? { user: input.thread.userId } : {}),
		},
		...getWorkspaceAiReasoningOptions(modelId),
	} satisfies WorkspaceAiProviderOptions;
}

function getWorkspaceAiReasoningOptions(
	modelId: ReturnType<typeof resolveWorkspaceAiChatModelId>,
): WorkspaceAiProviderOptions {
	switch (modelId) {
		case "gemini":
			return {
				google: {
					thinkingConfig: { thinkingLevel: "low" },
				},
				vertex: {
					thinkingConfig: { thinkingLevel: "low" },
				},
			};
		case "gpt-terra":
			return {
				openai: {
					reasoningEffort: "none",
				},
			};
		default:
			return {};
	}
}

function getVercelAiGatewayApiKey(env: Cloudflare.Env) {
	const apiKey =
		(env as { AI_GATEWAY_API_KEY?: string }).AI_GATEWAY_API_KEY ?? process.env.AI_GATEWAY_API_KEY;

	if (!apiKey) {
		throw new Error("AI_GATEWAY_API_KEY is required to use Vercel AI Gateway.");
	}

	return apiKey;
}

export async function generateAIThreadTitle(input: { env: Cloudflare.Env; messages: UIMessage[] }) {
	const firstUserMessage = getFirstUserMessageText(input.messages);

	if (!firstUserMessage) {
		return undefined;
	}

	const prompt = firstUserMessage;
	const startedAt = Date.now();
	const result = await generateText({
		model: getWorkspaceAiLanguageModelForGatewayModel(AI_THREAD_TITLE_GATEWAY_MODEL, input.env),
		providerOptions: {
			gateway: {
				...getWorkspaceAiGatewayTransportOptions(),
				...getAIThreadTitleGatewayRoutingOptions(),
				tags: [
					"app:thinkex",
					"feature:workspace-chat",
					"task:title-generation",
					`model:${AI_THREAD_TITLE_GATEWAY_MODEL}`,
				],
			},
			// The 2.5-series title model rejects `thinkingLevel` outright ("Thinking
			// level is not supported for this model"), which 400s every Google leg
			// and silently pushes titles onto the fallback. Budget is its knob.
			google: {
				thinkingConfig: { thinkingBudget: 0 },
			},
			vertex: {
				thinkingConfig: { thinkingBudget: 0 },
			},
			// The fallback nano is a reasoning model; a six-word title needs none of
			// it, and thinking tokens bill as output. Effort values differ per nano
			// — 5.4 takes "none", 5 takes "minimal" — and the wrong one 400s the leg.
			openai: {
				reasoningEffort: "none",
			},
		} as WorkspaceAiProviderOptions,
		instructions:
			"Produce a concise chat title for the user message. Two to six words. No quotes, no trailing punctuation.",
		prompt,
		// No temperature: the fallback nano rejects the parameter, and a schema
		// this tight doesn't need it.
		output: Output.object({
			schema: AI_THREAD_TITLE_OUTPUT_SCHEMA,
			name: "chat_title",
			description: "A concise 2-6 word title summarizing the chat.",
		}),
	});

	return {
		title: result.output?.title ?? "",
		gatewayModel: AI_THREAD_TITLE_GATEWAY_MODEL,
		prompt,
		usage: result.usage,
		providerMetadata: result.providerMetadata,
		latencySeconds: (Date.now() - startedAt) / 1000,
	};
}

const AI_THREAD_TITLE_OUTPUT_SCHEMA = z.object({
	title: z
		.string()
		.trim()
		.min(1)
		.max(80)
		.describe("Two to six word chat title. No quotes, no trailing punctuation."),
});

export { getAIThreadSoulPrompt } from "#/features/workspaces/ai/ai-thread-soul-prompt";

export function getAIThreadSystemPromptForWorkspace(
	system: string,
	promptScope: AIThreadPromptScope,
	options: {
		now?: Date;
		timeZone?: string;
		workspaceAiContext?: unknown;
	} = {},
) {
	return [
		stripThinkCapabilityBlock(system),
		AI_THREAD_WORKSPACE_CITATION_PROMPT,
		getThinkExRuntimeScopePrompt(promptScope, options),
	].join("\n\n");
}

function stripThinkCapabilityBlock(system: string) {
	const markerIndex = system.indexOf(THINK_CAPABILITY_BLOCK_MARKER);

	if (markerIndex === -1) {
		return system.trimEnd();
	}

	return system.slice(0, markerIndex).trimEnd();
}

function getThinkExRuntimeScopePrompt(
	promptScope: AIThreadPromptScope,
	options: {
		now?: Date;
		timeZone?: string;
		workspaceAiContext?: unknown;
	},
) {
	const timeZone = getPromptTimeZone(options.timeZone);
	const workspaceAiContext = formatWorkspaceAiContextForPrompt(options.workspaceAiContext);

	return [
		thinkPromptSectionDivider,
		"CURRENT TURN [readonly]",
		thinkPromptSectionDivider,
		`- Workspace: ${promptScope.workspaceName}`,
		promptScope.canMutate ? null : AI_THREAD_VIEW_ONLY_WORKSPACE_LINE,
		`- Date/time: ${formatPromptDateTime(options.now ?? new Date(), timeZone)}`,
		"- Actual workspace paths are absolute, such as /.",
		workspaceAiContext ? `\n${workspaceAiContext}` : "",
	]
		.filter(Boolean)
		.join("\n");
}

function getPromptTimeZone(value: string | undefined) {
	if (!value?.trim()) {
		return "UTC";
	}

	try {
		new Intl.DateTimeFormat("en-US", { timeZone: value });
		return value;
	} catch {
		return "UTC";
	}
}

const promptDateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function getPromptDateTimeFormatter(timeZone: string) {
	const cachedFormatter = promptDateTimeFormatters.get(timeZone);

	if (cachedFormatter) {
		return cachedFormatter;
	}

	const formatter = new Intl.DateTimeFormat("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZone,
		timeZoneName: "short",
	});
	promptDateTimeFormatters.set(timeZone, formatter);

	return formatter;
}

function formatPromptDateTime(date: Date, timeZone: string) {
	return `${getPromptDateTimeFormatter(timeZone).format(date)} (${timeZone})`;
}

function getFirstUserMessageText(messages: UIMessage[]) {
	const firstUserMessage = messages.find((message) => message.role === "user");

	if (!firstUserMessage) {
		return "";
	}

	return firstUserMessage.parts
		.filter((part): part is { type: "text"; text: string } => {
			return part.type === "text";
		})
		.map((part) => part.text)
		.join("\n")
		.trim()
		.slice(0, 1000);
}
