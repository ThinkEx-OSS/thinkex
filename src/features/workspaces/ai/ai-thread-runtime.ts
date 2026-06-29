import { createWorkspaceStateBackend, type WorkspaceFsLike } from "@cloudflare/shell";
import { createExecuteTool } from "@cloudflare/think/tools/execute";
import type { WorkspaceLike } from "@cloudflare/think/tools/workspace";
import { createWorkspaceTools } from "@cloudflare/think/tools/workspace";
import type { LanguageModel, ToolSet, UIMessage } from "ai";
import { addToolInputExamplesMiddleware, createGateway, generateText, wrapLanguageModel } from "ai";

import type {
	AIThreadContext,
	AIThreadPromptScope,
} from "#/features/workspaces/ai/ai-thread-metadata";
import {
	DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID,
	getWorkspaceAiChatModel,
	type resolveWorkspaceAiChatModelId,
} from "#/features/workspaces/ai/models";
import { createAIThreadCodeRunTools } from "#/features/workspaces/ai/code-run-tools";
import { createAIThreadResearchTools } from "#/features/workspaces/ai/research-tools";
import { createAIThreadTimeTools } from "#/features/workspaces/ai/time-tools";
import { createAIThreadWebTools } from "#/features/workspaces/ai/web-tools";
import { createAIThreadWorkspaceTools } from "#/features/workspaces/ai/workspace-tools";
import { formatWorkspaceAiContextForPrompt } from "#/features/workspaces/model/workspace-ai-context";

const thinkPromptSectionDivider = "══════════════════════════════════════════════";

const AI_THREAD_TITLE_GATEWAY_MODEL = "google/gemini-2.5-flash-lite";
const AI_THREAD_TITLE_FALLBACK_MODELS = ["openai/gpt-4.1-nano"] as const;

type WorkspaceAiProviderOptions = NonNullable<
	Parameters<typeof generateText>[0]["providerOptions"]
>;

const THINK_CAPABILITY_BLOCK_MARKER = "You are running inside a Think agent.";
const AI_THREAD_ORCHESTRATE_TOOL_NAME = "orchestrate";

const AI_THREAD_VIEW_ONLY_WORKSPACE_LINE =
	"- Workspace access: view-only. Do not create, rename, edit, move, or delete workspace items.";
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
	timeZone?: string;
}) {
	const toolCatalog = createAIThreadToolCatalog(input);
	const workspaceFs = isWorkspaceFsLike(input.workspace) ? input.workspace : undefined;
	const state = workspaceFs ? createWorkspaceStateBackend(workspaceFs) : undefined;
	const hasState = workspaceFs !== undefined;
	const activeToolNames = toolCatalog.getActiveToolNames(input.canMutate);

	return {
		activeTools: activeToolNames,
		tools: {
			orchestrate: createExecuteTool({
				ctx: input.ctx,
				loader: input.env.LOADER,
				state,
				tools: toolCatalog.getCodemodeTools(input.canMutate),
				name: AI_THREAD_ORCHESTRATE_TOOL_NAME,
				description: getAIThreadOrchestrateDescription(hasState),
			}),
		} satisfies ToolSet,
	};
}

interface AIThreadToolEntry {
	codemode: boolean;
	mutating: boolean;
	name: string;
	tool: ToolSet[string];
}

type AIThreadToolDescriptor = Omit<AIThreadToolEntry, "tool">;

const AI_THREAD_SANDBOX_TOOL_DESCRIPTORS: AIThreadToolDescriptor[] = [
	{
		name: "sandbox_bash",
		codemode: false,
		mutating: false,
	},
];

const AI_THREAD_CODE_RUN_TOOL_DESCRIPTORS: AIThreadToolDescriptor[] = [
	{
		name: "compute",
		codemode: true,
		mutating: false,
	},
];

const AI_THREAD_WEB_TOOL_DESCRIPTORS: AIThreadToolDescriptor[] = [
	{
		name: "web_search",
		codemode: true,
		mutating: false,
	},
	{
		name: "web_markdown",
		codemode: true,
		mutating: false,
	},
	{
		name: "web_links",
		codemode: true,
		mutating: false,
	},
];

const AI_THREAD_RESEARCH_TOOL_DESCRIPTORS: AIThreadToolDescriptor[] = [
	{
		name: "research_discover",
		codemode: true,
		mutating: false,
	},
	{
		name: "research_deepen",
		codemode: true,
		mutating: false,
	},
];

const AI_THREAD_TIME_TOOL_DESCRIPTORS: AIThreadToolDescriptor[] = [
	{
		name: "time_get_current",
		codemode: true,
		mutating: false,
	},
	{
		name: "time_calculate_relative",
		codemode: true,
		mutating: false,
	},
];

const AI_THREAD_WORKSPACE_TOOL_DESCRIPTORS: AIThreadToolDescriptor[] = [
	{
		name: "workspace_list_items",
		codemode: true,
		mutating: false,
	},
	{
		name: "workspace_read_items",
		codemode: true,
		mutating: false,
	},
	{
		name: "workspace_create_items",
		codemode: true,
		mutating: true,
	},
	{
		name: "workspace_move_items",
		codemode: true,
		mutating: true,
	},
	{
		name: "workspace_delete_items",
		codemode: true,
		mutating: true,
	},
	{
		name: "workspace_rename_item",
		codemode: true,
		mutating: true,
	},
	{
		name: "workspace_edit_item",
		codemode: true,
		mutating: true,
	},
];

function createAIThreadToolCatalog(input: {
	env: Cloudflare.Env;
	threadId: string;
	workspace: WorkspaceLike;
	getThreadContext: () => Promise<AIThreadContext | null>;
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
		getThreadContext: input.getThreadContext,
	});
	const entries: AIThreadToolEntry[] = [];

	addAIThreadToolEntries(entries, sandboxTools, AI_THREAD_SANDBOX_TOOL_DESCRIPTORS);
	addAIThreadToolEntries(entries, codeRunTools, AI_THREAD_CODE_RUN_TOOL_DESCRIPTORS);
	addAIThreadToolEntries(entries, webTools, AI_THREAD_WEB_TOOL_DESCRIPTORS);
	addAIThreadToolEntries(entries, researchTools, AI_THREAD_RESEARCH_TOOL_DESCRIPTORS);
	addAIThreadToolEntries(entries, timeTools, AI_THREAD_TIME_TOOL_DESCRIPTORS);
	addAIThreadToolEntries(entries, workspaceTools, AI_THREAD_WORKSPACE_TOOL_DESCRIPTORS);

	return {
		tools: createAIThreadToolSet(entries),
		getActiveToolNames(canMutate: boolean) {
			const names = entries
				.filter((entry) => canMutate || !entry.mutating)
				.map((entry) => entry.name);

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
				entries.filter((entry) => entry.codemode && (canMutate || !entry.mutating)),
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
		sandboxTools.sandbox_bash = {
			...tools.bash,
			description:
				"Run a sandboxed Bash script against private sandbox files. Use this for shell-style scratch work inside the assistant sandbox only. This does not run against the actual ThinkEx workspace.",
		};
	}

	return sandboxTools;
}

function getAIThreadOrchestrateDescription(hasState: boolean) {
	const stateLine = hasState
		? "- `state.*` is the private assistant sandbox filesystem for scratch files and directories only. Nothing in `state.*` becomes a real ThinkEx workspace item unless you explicitly call a real workspace mutation tool through `tools.*`."
		: "- `state.*` is unavailable in this runtime. Use `tools.*` for real workspace, web, and research operations.";
	const workflowLine = hasState
		? "3. Call the method shown by the docs, for example `await tools.workspace_list_items(args)` or `await state.readFile(args)`."
		: "3. Call the method shown by the docs, for example `await tools.workspace_list_items(args)`.";
	const globalsLine = hasState
		? "- The only globals are `state`, `tools`, and `codemode` plus standard JavaScript. There is no `host`, `fs`, `require`, `process`, or Node.js API."
		: "- The only globals are `tools` and `codemode` plus standard JavaScript. There is no `host`, `fs`, `require`, `process`, or Node.js API.";

	return [
		"Orchestrate multi-step work by running JavaScript in a private assistant sandbox with access to ThinkEx connector SDKs.",
		"",
		"## Boundaries",
		"",
		stateLine,
		"- `tools.*` exposes actual ThinkEx workspace, web, research, and time operations.",
		"- `tools.compute` executes private Python, JavaScript, or TypeScript for calculations, data analysis, and charts.",
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
		"- Do not use `fetch`. Use connector SDKs.",
		"",
		"## Snippets",
		"",
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

function addAIThreadToolEntry(
	entries: AIThreadToolEntry[],
	entry: AIThreadToolEntry | { tool: undefined; name: string },
) {
	if (!entry.tool) {
		return;
	}

	entries.push(entry);
}

function addAIThreadToolEntries(
	entries: AIThreadToolEntry[],
	tools: ToolSet,
	descriptors: AIThreadToolDescriptor[],
) {
	for (const descriptor of descriptors) {
		addAIThreadToolEntry(entries, {
			...descriptor,
			tool: tools[descriptor.name],
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
		providerTimeouts: {
			byok: {
				azure: 8000,
				bedrock: 8000,
				openai: 8000,
				vertex: 8000,
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
			user: input?.thread?.userId,
		},
		...getWorkspaceAiReasoningOptions(modelId),
	} as unknown as WorkspaceAiProviderOptions;
}

function getWorkspaceAiGatewayRoutingOptions(
	modelId: ReturnType<typeof resolveWorkspaceAiChatModelId>,
) {
	switch (modelId) {
		case "claude-sonnet":
			return {
				order: ["bedrock", "vertex"],
				models: ["google/gemini-3-flash", "openai/gpt-5.4-mini"],
				sort: "ttft",
			};
		case "gemini":
			return {
				order: ["google", "vertex"],
				models: ["openai/gpt-5.4-mini"],
				sort: "ttft",
			};
		case "chatgpt":
			return {
				order: ["openai", "azure"],
				models: ["google/gemini-3-flash", "openai/gpt-5.4-mini"],
				sort: "ttft",
			};
		default:
			return {};
	}
}

function getWorkspaceAiReasoningOptions(modelId: ReturnType<typeof resolveWorkspaceAiChatModelId>) {
	switch (modelId) {
		case "claude-sonnet":
			return {
				bedrock: {
					reasoningConfig: { type: "adaptive", maxReasoningEffort: "low" },
				},
			};
		case "gemini":
			return {
				google: {
					thinkingConfig: { thinkingLevel: "low" },
				},
				vertex: {
					thinkingConfig: { thinkingLevel: "low" },
				},
			};
		case "chatgpt":
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

	const prompt = [
		"Write a concise chat title for this first user message.",
		"Return only the title. No quotes. No punctuation at the end.",
		"Use 2 to 6 words.",
		"",
		firstUserMessage,
	].join("\n");
	const startedAt = Date.now();
	const result = await generateText({
		model: getWorkspaceAiLanguageModelForGatewayModel(AI_THREAD_TITLE_GATEWAY_MODEL, input.env),
		providerOptions: {
			gateway: {
				...getWorkspaceAiGatewayTransportOptions(),
				order: ["google", "vertex"],
				models: [...AI_THREAD_TITLE_FALLBACK_MODELS],
				sort: "ttft",
				tags: [
					"app:thinkex",
					"feature:workspace-chat",
					"task:title-generation",
					`model:${AI_THREAD_TITLE_GATEWAY_MODEL}`,
				],
			},
			google: {
				thinkingConfig: { thinkingLevel: "low" },
			},
			vertex: {
				thinkingConfig: { thinkingLevel: "low" },
			},
		} as WorkspaceAiProviderOptions,
		prompt,
		temperature: 0.2,
	});

	return {
		title: result.text,
		gatewayModel: AI_THREAD_TITLE_GATEWAY_MODEL,
		prompt,
		usage: result.usage,
		latencySeconds: (Date.now() - startedAt) / 1000,
	};
}

export function getAIThreadSoulPrompt() {
	return [
		"You are ThinkEx's workspace assistant.",
		"Help the user understand, organize, and work in their actual ThinkEx workspace.",
		"Actual workspace means user-visible ThinkEx content. Private sandbox means assistant-only scratch files.",
		"Use actual workspace tools to inspect workspace contents; change the workspace only through actual workspace mutation tools.",
		"Never use private sandbox files as user-visible workspace items.",
		"Do not claim to have read actual workspace content unless an actual workspace tool returned it.",
		"Resolve this/it/that/here/above/the page/this file from current-turn context: selected quotes, then active view, then active/open items. Ask briefly before changes if ambiguous.",
		"Web tools read public web content only.",
		"Whenever you call a user-visible tool, you must provide a short plain-English title for that tool call. Treat the title as required, not optional.",
		"Tool titles must be present-progressive activity phrases like 'Reading workspace', 'Researching sources', or 'Updating workspace'.",
		"Use time_get_current for exact time in UTC or a requested IANA time zone, and time_calculate_relative for exact relative time math; the current turn includes user-local date/time context.",
		"Use memory only for durable preferences, workspace goals, thread goals, and decisions. Do not store transient requests, secrets, full documents, item bodies, or actual workspace state.",
		"Follow tool descriptions and schemas. Keep answers concise, concrete, and action-oriented.",
	]
		.filter(Boolean)
		.join("\n");
}

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
