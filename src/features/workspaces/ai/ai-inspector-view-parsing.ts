import type {
	AIInspectorMessageView,
	AIInspectorToolCallPreview,
	AIInspectorToolDefinitionView,
} from "#/features/workspaces/ai/ai-inspector-view-types";

export function parseToolDefinitions(tools: unknown): AIInspectorToolDefinitionView[] {
	if (!Array.isArray(tools)) {
		return [];
	}

	return tools.map((tool) => {
		const record = asRecord(tool);
		return {
			name: getString(record.name) ?? "unknownTool",
			description: getString(record.description),
			inputSchema: record.inputSchema,
			outputSchema: record.outputSchema,
			metadata: record.metadata,
			strict: record.strict,
			title: getString(record.title),
		};
	});
}

export function parseMessages(messages: unknown): AIInspectorMessageView[] {
	if (!Array.isArray(messages)) {
		return [];
	}

	return messages.map((message) => {
		const record = asRecord(message);
		const content = record.parts ?? record.content;
		const toolCalls = parseToolPreviews(content);
		return {
			role: getString(record.role),
			text: normalizeText(content),
			toolCalls,
			raw: message,
		};
	});
}

export function parseToolPreviews(content: unknown): AIInspectorToolCallPreview[] {
	if (!Array.isArray(content)) {
		return [];
	}

	return content.flatMap((part) => {
		const record = asRecord(part);
		const toolName = getString(record.toolName);
		const toolCallId = getString(record.toolCallId);
		if (!toolName && !toolCallId) {
			return [];
		}

		return {
			type: getString(record.type),
			toolCallId,
			toolName,
			input: record.input,
			output: record.output ?? record.result,
			text: getString(record.text),
		};
	});
}

export function normalizeText(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}

	if (!Array.isArray(value)) {
		return "";
	}

	const textParts: string[] = [];

	for (const part of value) {
		const text = getString(asRecord(part).text);

		if (text) {
			textParts.push(text);
		}
	}

	return textParts.join("\n");
}

export function getStepNumber(payload: Record<string, unknown>, fallback: number) {
	const stepNumber = getNumber(payload.stepNumber);
	return typeof stepNumber === "number" ? stepNumber + 1 : fallback;
}

export function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function getNestedString(
	record: Record<string, unknown>,
	path: string[],
): string | undefined {
	let current: unknown = record;
	for (const key of path) {
		current = asRecord(current)[key];
	}
	return getString(current);
}

export function getString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

export function getNumber(value: unknown): number | undefined {
	return typeof value === "number" ? value : undefined;
}
