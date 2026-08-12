import type { StepContext } from "@cloudflare/think";

const MAX_TELEMETRY_STRING_LENGTH = 6000;
const MAX_TELEMETRY_ARRAY_LENGTH = 80;
const MAX_TELEMETRY_OBJECT_KEYS = 80;
const MAX_TELEMETRY_DEPTH = 8;

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

export function summarizeAiTelemetryMessages(messages: unknown) {
	if (!Array.isArray(messages)) {
		return sanitizeAiTelemetryValue(messages);
	}

	return messages.map((message) => {
		if (!message || typeof message !== "object") {
			return sanitizeAiTelemetryValue(message);
		}

		const record = message as Record<string, unknown>;
		return sanitizeAiTelemetryValue({
			role: record.role,
			content: summarizeMessageContent(record.content),
			parts: summarizeMessageContent(record.parts),
			toolCallId: record.toolCallId,
			toolName: record.toolName,
		});
	});
}

export function getAiTelemetryErrorPayload(error: unknown) {
	if (error instanceof Error) {
		return sanitizeAiTelemetryValue({
			name: error.name,
			message: error.message,
			stack: error.stack,
		});
	}

	return sanitizeAiTelemetryValue(error);
}

export function sanitizeAiTelemetryValue(value: unknown): unknown {
	return sanitizeValue(value, 0, new WeakSet<object>());
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

	// Last-resort fallback: AI SDK v7 stopped populating request.body by default
	// (see include: { requestBody } option). The earlier ctx.messages /
	// request.messages paths are what fire in practice through Think.
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
	// AI SDK v7 moved cache + reasoning breakdowns under inputTokenDetails /
	// outputTokenDetails; keep v6 top-level fallbacks so historical telemetry
	// records replayed through this normalizer still resolve.
	const cacheReadInputTokens =
		getNestedTokenValue(record.inputTokenDetails, "cacheReadTokens") ??
		getTokenValue(record.cachedInputTokens) ??
		getNestedTokenValue(record.inputTokens, "cacheRead");
	const cacheCreationInputTokens =
		getNestedTokenValue(record.inputTokenDetails, "cacheWriteTokens") ??
		getTokenValue(record.cacheCreationInputTokens) ??
		getNestedTokenValue(record.inputTokens, "cacheWrite");
	const reasoningTokens =
		getNestedTokenValue(record.outputTokenDetails, "reasoningTokens") ??
		getTokenValue(record.reasoningTokens) ??
		getNestedTokenValue(record.outputTokens, "reasoning");
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

function summarizeMessageContent(content: unknown) {
	if (!Array.isArray(content)) {
		return sanitizeAiTelemetryValue(content);
	}

	return content.map((part) => {
		if (!part || typeof part !== "object") {
			return sanitizeAiTelemetryValue(part);
		}

		const record = part as Record<string, unknown>;
		return sanitizeAiTelemetryValue({
			type: record.type,
			text: record.text,
			state: record.state,
			toolCallId: record.toolCallId,
			toolName: record.toolName,
			input: record.input,
			output: record.output,
			errorText: record.errorText,
			providerExecuted: record.providerExecuted,
			providerMetadata: record.providerMetadata,
			sourceType: record.sourceType,
			id: record.id,
			title: record.title,
			url: record.url,
		});
	});
}

function sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
	if (value === null || value === undefined) {
		return value;
	}

	if (typeof value === "string") {
		return value.length > MAX_TELEMETRY_STRING_LENGTH
			? `${value.slice(0, MAX_TELEMETRY_STRING_LENGTH)}...`
			: value;
	}

	if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
		return typeof value === "bigint" ? value.toString() : value;
	}

	if (typeof value === "function" || typeof value === "symbol") {
		return `[${typeof value}]`;
	}

	if (depth >= MAX_TELEMETRY_DEPTH) {
		return "[max-depth]";
	}

	if (value instanceof Error) {
		return { name: value.name, message: value.message, stack: value.stack };
	}

	if (typeof value !== "object") {
		return value;
	}

	if (seen.has(value)) {
		return "[circular]";
	}
	seen.add(value);

	if (Array.isArray(value)) {
		return value
			.slice(0, MAX_TELEMETRY_ARRAY_LENGTH)
			.map((entry) => sanitizeValue(entry, depth + 1, seen));
	}

	const output: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(value).slice(0, MAX_TELEMETRY_OBJECT_KEYS)) {
		output[key] = sanitizeValue(entry, depth + 1, seen);
	}
	return output;
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
