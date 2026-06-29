import {
	getInspectorErrorPayload,
	sanitizeInspectorValue,
} from "#/features/workspaces/ai/ai-inspector-sanitize";

export {
	getInspectorErrorPayload,
	sanitizeInspectorValue,
	serializeInspectorPayload,
} from "#/features/workspaces/ai/ai-inspector-sanitize";

export function summarizeInspectorMessages(messages: unknown) {
	if (!Array.isArray(messages)) {
		return sanitizeInspectorValue(messages);
	}

	return messages.map((message) => {
		if (!message || typeof message !== "object") {
			return sanitizeInspectorValue(message);
		}

		const record = message as Record<string, unknown>;

		return sanitizeInspectorValue({
			role: record.role,
			content: summarizeMessageContent(record.content),
			parts: summarizeMessageContent(record.parts),
			toolCallId: record.toolCallId,
			toolName: record.toolName,
		});
	});
}

export async function summarizeInspectorTools(tools: unknown) {
	if (!tools || typeof tools !== "object") {
		return [];
	}

	return await Promise.all(
		Object.entries(tools).map(async ([name, tool]) => {
			const record = tool && typeof tool === "object" ? (tool as Record<string, unknown>) : {};

			return sanitizeInspectorValue({
				name,
				description: record.description,
				inputSchema: await getInspectableSchema(record.inputSchema),
				outputSchema: await getInspectableSchema(record.outputSchema),
				inputExamples: record.inputExamples,
				metadata: record.metadata,
				strict: record.strict,
				title: record.title,
			});
		}),
	);
}

function summarizeMessageContent(content: unknown) {
	if (!Array.isArray(content)) {
		return sanitizeInspectorValue(content);
	}

	return content.map((part) => {
		if (!part || typeof part !== "object") {
			return sanitizeInspectorValue(part);
		}

		const record = part as Record<string, unknown>;

		return sanitizeInspectorValue({
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

async function getInspectableSchema(schema: unknown): Promise<unknown> {
	const candidate = unwrapSchema(schema);

	if (!candidate || typeof candidate !== "object") {
		return sanitizeInspectorValue(candidate);
	}

	const record = candidate as Record<string | symbol, unknown>;

	try {
		const toJSONSchema = record.toJSONSchema;
		if (typeof toJSONSchema === "function") {
			return await toJSONSchema.call(candidate);
		}

		if ("jsonSchema" in record) {
			return await record.jsonSchema;
		}

		const standard = record["~standard"];
		if (standard && typeof standard === "object") {
			const standardRecord = standard as Record<string, unknown>;
			const jsonSchema = standardRecord.jsonSchema;
			if (jsonSchema && typeof jsonSchema === "object") {
				const jsonSchemaRecord = jsonSchema as Record<string, unknown>;
				const input = jsonSchemaRecord.input;
				if (typeof input === "function") {
					return await input.call(jsonSchema, { target: "draft-07" });
				}
			}
		}
	} catch (error) {
		return getInspectorErrorPayload(error);
	}

	return sanitizeInspectorValue(candidate);
}

function unwrapSchema(schema: unknown): unknown {
	if (typeof schema !== "function") {
		return schema;
	}

	try {
		return schema();
	} catch {
		return schema;
	}
}

export function summarizeInspectorToolResult(toolResult: unknown) {
	if (!toolResult || typeof toolResult !== "object") {
		return sanitizeInspectorValue(toolResult);
	}

	const record = toolResult as Record<string, unknown>;

	return sanitizeInspectorValue({
		type: record.type,
		toolCallId: record.toolCallId,
		toolName: record.toolName,
		input: record.input,
		output: record.output,
		result: record.result,
		error: record.error,
	});
}

export function summarizeInspectorToolCall(toolCall: unknown) {
	if (!toolCall || typeof toolCall !== "object") {
		return sanitizeInspectorValue(toolCall);
	}

	const record = toolCall as Record<string, unknown>;

	return sanitizeInspectorValue({
		type: record.type,
		toolCallId: record.toolCallId,
		toolName: record.toolName,
		input: record.input,
		args: record.args,
		dynamic: record.dynamic,
		providerExecuted: record.providerExecuted,
	});
}

export function summarizeInspectorToolList(toolCalls: unknown) {
	if (!Array.isArray(toolCalls)) {
		return sanitizeInspectorValue(toolCalls);
	}

	return toolCalls.map((toolCall) => summarizeInspectorToolCall(toolCall));
}

export function summarizeInspectorToolResultList(toolResults: unknown) {
	if (!Array.isArray(toolResults)) {
		return sanitizeInspectorValue(toolResults);
	}

	return toolResults.map((toolResult) => summarizeInspectorToolResult(toolResult));
}

export function summarizeInspectorChunk(chunk: unknown) {
	if (!chunk || typeof chunk !== "object") {
		return sanitizeInspectorValue(chunk);
	}

	const record = chunk as Record<string, unknown>;
	const type = record.type;

	if (type === "text-delta" || type === "reasoning-delta") {
		return sanitizeInspectorValue({
			type,
			text: record.text,
			delta: record.delta,
		});
	}

	return sanitizeInspectorValue(chunk);
}

export interface AIInspectorChunkAccumulator {
	rawStreamEvents: unknown[];
}

export function createInspectorChunkAccumulator(): AIInspectorChunkAccumulator {
	return {
		rawStreamEvents: [],
	};
}

export function resetInspectorChunkAccumulator(accumulator: AIInspectorChunkAccumulator) {
	accumulator.rawStreamEvents = [];
}

export function recordInspectorChunk(accumulator: AIInspectorChunkAccumulator, chunk: unknown) {
	const summary = summarizeInspectorChunk(chunk);
	if (!summary || typeof summary !== "object") {
		if (accumulator.rawStreamEvents.length < 20) {
			accumulator.rawStreamEvents.push(summary);
		}
		return;
	}

	const record = summary as Record<string, unknown>;
	const type = record.type;

	if (type === "text-delta" || type === "reasoning-delta") {
		return;
	}

	if (accumulator.rawStreamEvents.length < 20) {
		accumulator.rawStreamEvents.push(summary);
	}
}

export function summarizeInspectorChunks(accumulator: AIInspectorChunkAccumulator) {
	if (accumulator.rawStreamEvents.length === 0) {
		return undefined;
	}

	return sanitizeInspectorValue({
		rawStreamEvents: accumulator.rawStreamEvents,
	});
}
