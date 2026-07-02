import type { StepContext } from "@cloudflare/think";

export interface AiTelemetryTokenUsage {
	cacheCreationInputTokens?: number;
	cacheReadInputTokens?: number;
	inputTokens?: number;
	outputTokens?: number;
	reasoningTokens?: number;
	totalTokens?: number;
}

export function buildAiTelemetryInputFromPrompt(prompt: string) {
	return [{ role: "user", content: prompt }];
}

export function buildAiTelemetryOutputFromText(text: string) {
	return [{ role: "assistant", content: text }];
}

export function buildAiTelemetryToolDefinitions(tools: unknown) {
	if (!tools || typeof tools !== "object") {
		return null;
	}

	return Object.entries(tools).map(([name, tool]) => {
		const record = tool && typeof tool === "object" ? (tool as Record<string, unknown>) : {};

		return {
			type: "function",
			function: {
				name,
				description: record.description,
			},
		};
	});
}

export function buildAiTelemetryInputFromStep(ctx: StepContext) {
	const stepRecord = ctx as StepContext & { messages?: unknown };

	if (Array.isArray(stepRecord.messages)) {
		return stepRecord.messages;
	}

	const request = ctx.request as Record<string, unknown> | undefined;

	if (!request || typeof request !== "object") {
		return [];
	}

	if (Array.isArray(request.messages)) {
		return request.messages;
	}

	const body = request.body;
	if (!body || typeof body !== "object") {
		return [];
	}

	const bodyRecord = body as Record<string, unknown>;

	if (Array.isArray(bodyRecord.messages)) {
		return bodyRecord.messages;
	}

	if (typeof bodyRecord.prompt === "string") {
		return buildAiTelemetryInputFromPrompt(bodyRecord.prompt);
	}

	return [];
}

export function buildAiTelemetryOutputFromStep(ctx: StepContext) {
	const toolCalls = buildPostHogToolCallOutput(ctx.toolCalls);

	if (ctx.text) {
		const content =
			toolCalls.length > 0 ? [{ type: "text", text: ctx.text }, ...toolCalls] : ctx.text;

		return [{ role: "assistant", content }];
	}

	const response = ctx.response as Record<string, unknown> | undefined;
	const messages = response?.messages;

	if (Array.isArray(messages)) {
		return messages;
	}

	if (toolCalls.length > 0) {
		return [{ role: "assistant", content: toolCalls }];
	}

	return [];
}

export function getAiTelemetryToolCallNames(toolCalls: unknown) {
	return normalizeAiTelemetryToolCalls(toolCalls).map((toolCall) => toolCall.name);
}

export function normalizeAiTelemetryToolCalls(toolCalls: unknown) {
	if (!Array.isArray(toolCalls)) {
		return [];
	}

	return toolCalls
		.map((toolCall) => {
			const name = getToolCallName(toolCall);

			if (!name) {
				return null;
			}

			return {
				id: getToolCallId(toolCall),
				input: getToolCallInput(toolCall),
				name,
			};
		})
		.filter((toolCall): toolCall is NonNullable<typeof toolCall> => toolCall !== null);
}

export function extractAiTelemetryTokenUsage(usage: unknown): AiTelemetryTokenUsage | undefined {
	if (!usage || typeof usage !== "object") {
		return undefined;
	}

	const record = usage as Record<string, unknown>;
	const inputTokens = getTokenValue(record.inputTokens) ?? getTokenValue(record.promptTokens);
	const outputTokens = getTokenValue(record.outputTokens) ?? getTokenValue(record.completionTokens);
	const cacheReadInputTokens =
		getTokenValue(record.cachedInputTokens) ?? getNestedTokenValue(record.inputTokens, "cacheRead");
	const cacheCreationInputTokens =
		getTokenValue(record.cacheCreationInputTokens) ??
		getNestedTokenValue(record.inputTokens, "cacheWrite");
	const reasoningTokens =
		getTokenValue(record.reasoningTokens) ?? getNestedTokenValue(record.outputTokens, "reasoning");
	const totalTokens = getTokenValue(record.totalTokens);

	return dropUndefined({
		cacheCreationInputTokens,
		cacheReadInputTokens,
		inputTokens,
		outputTokens,
		reasoningTokens,
		totalTokens,
	});
}

export function buildTccTokenUsage(usage: AiTelemetryTokenUsage | undefined) {
	if (!usage) {
		return undefined;
	}

	return dropUndefined({
		uncached:
			usage.inputTokens === undefined
				? undefined
				: Math.max(0, usage.inputTokens - (usage.cacheReadInputTokens ?? 0)),
		cached: usage.cacheReadInputTokens,
		completion: usage.outputTokens,
	});
}

function buildPostHogToolCallOutput(toolCalls: unknown) {
	return normalizeAiTelemetryToolCalls(toolCalls).map((toolCall) => ({
		type: "tool-call",
		id: toolCall.id,
		function: {
			name: toolCall.name,
			arguments: stringifyToolArguments(toolCall.input),
		},
	}));
}

function getToolCallName(toolCall: unknown) {
	if (!toolCall || typeof toolCall !== "object") {
		return undefined;
	}

	const record = toolCall as Record<string, unknown>;

	return typeof record.toolName === "string"
		? record.toolName
		: typeof record.name === "string"
			? record.name
			: undefined;
}

function getToolCallId(toolCall: unknown) {
	if (!toolCall || typeof toolCall !== "object") {
		return undefined;
	}

	const record = toolCall as Record<string, unknown>;

	return typeof record.toolCallId === "string"
		? record.toolCallId
		: typeof record.id === "string"
			? record.id
			: undefined;
}

function getToolCallInput(toolCall: unknown) {
	if (!toolCall || typeof toolCall !== "object") {
		return undefined;
	}

	const record = toolCall as Record<string, unknown>;

	return record.input ?? record.args ?? record.arguments;
}

function stringifyToolArguments(input: unknown) {
	if (typeof input === "string") {
		return input;
	}

	if (input === undefined) {
		return "{}";
	}

	try {
		return JSON.stringify(input);
	} catch {
		return "[unserializable arguments]";
	}
}

function getTokenValue(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getNestedTokenValue(value: unknown, key: string) {
	if (!value || typeof value !== "object") {
		return undefined;
	}

	return getTokenValue((value as Record<string, unknown>)[key]);
}

function dropUndefined<T extends Record<string, unknown>>(record: T) {
	return Object.fromEntries(
		Object.entries(record).filter(([, value]) => value !== undefined),
	) as Partial<T>;
}
