import type { FlexibleSchema, Schema, Tool, ToolExecutionOptions } from "ai";
import { asSchema, jsonSchema, tool } from "ai";
import { z } from "zod";

export const aiThreadActivityTitleSchema = z
	.string()
	.trim()
	.min(1)
	.describe(
		"What this run does in 3-6 words of plain present-tense English. Name the work, not code, tools, connectors, sandboxes, or APIs. Examples: “Rewriting the intro section”, “Finding sources to cite”, “Charting revenue by month”.",
	);

export interface AIThreadToolExecutionContext {
	abortSignal?: AbortSignal;
	codemodeExecutionId?: string;
	invocationId: string;
	source: "codemode" | "direct";
}

interface AIThreadToolRuntime<INPUT, OUTPUT> {
	execute(input: unknown, context: AIThreadToolExecutionContext): Promise<OUTPUT>;
	inputSchema: ReturnType<typeof asSchema<INPUT>>;
	outputSchema: ReturnType<typeof asSchema<OUTPUT>>;
}

const AI_THREAD_TOOL_RUNTIME = Symbol("AI thread tool runtime");

// The Tool<any, any, any> intersection makes the wrapped tool assignable to
// AI SDK v7 ToolSet entries, which type as a union of Tool variants using
// any/never for the type params. Concrete INPUT/OUTPUT are preserved in the
// runtime metadata that hangs off the symbol key.
type AIThreadTool<INPUT, OUTPUT> = Tool<any, any, any> & {
	[AI_THREAD_TOOL_RUNTIME]: AIThreadToolRuntime<INPUT, OUTPUT>;
};

type AIThreadToolDefinition<INPUT, OUTPUT> = Pick<
	Tool<INPUT, OUTPUT, Record<string, unknown>>,
	| "description"
	| "inputExamples"
	| "inputSchema"
	| "metadata"
	| "needsApproval"
	| "providerOptions"
	| "title"
	| "toModelOutput"
> & {
	execute(
		this: void,
		input: INPUT,
		context: AIThreadToolExecutionContext,
	): OUTPUT | PromiseLike<OUTPUT>;
	modelInputSchema?: FlexibleSchema<unknown>;
	outputSchema: FlexibleSchema<OUTPUT>;
};

/**
 * Defines a first-party tool once and gives every runtime adapter the same
 * validated execution path. Application executors receive only context that
 * both the AI SDK and Code Mode can represent honestly.
 */
export function defineAIThreadTool<INPUT, OUTPUT>(
	definition: AIThreadToolDefinition<INPUT, OUTPUT>,
): AIThreadTool<INPUT, OUTPUT> {
	const modelDefinition = getModelToolDefinition(definition);
	const inputSchema = asSchema(definition.inputSchema);
	const rawModelInputSchema = definition.modelInputSchema
		? asSchema(definition.modelInputSchema)
		: inputSchema;
	const modelInputSchema = createProviderCompatibleInputSchema(rawModelInputSchema);
	const outputSchema = asSchema(definition.outputSchema);
	const executeDefinition = definition.execute;

	if (!inputSchema.validate || !outputSchema.validate) {
		throw new Error("AI thread tools require runtime-validatable input and output schemas");
	}

	const validateInput = inputSchema.validate;
	const validateOutput = outputSchema.validate;
	const runtime: AIThreadToolRuntime<INPUT, OUTPUT> = {
		inputSchema,
		outputSchema,
		async execute(input, context) {
			const validatedInput = await validateInput(input);
			if (!validatedInput.success) {
				throw validatedInput.error;
			}

			const output = await executeDefinition(validatedInput.value, context);
			const validatedOutput = await validateOutput(output);
			if (!validatedOutput.success) {
				throw validatedOutput.error;
			}

			return validatedOutput.value;
		},
	};
	const aiTool = tool<INPUT, OUTPUT, Record<string, unknown>>({
		...modelDefinition,
		inputSchema: modelInputSchema,
		execute: (input: INPUT, options: ToolExecutionOptions<unknown>) =>
			runtime.execute(input, directExecutionContext(options)),
	} as unknown as Tool<INPUT, OUTPUT, Record<string, unknown>>);

	return Object.assign(aiTool, { [AI_THREAD_TOOL_RUNTIME]: runtime }) as AIThreadTool<
		INPUT,
		OUTPUT
	>;
}

type ModelJsonSchema = Awaited<Schema["jsonSchema"]>;

/**
 * Anthropic-compatible providers reject `maxItems` on custom tools. Runtime
 * validation still uses the original schema, so omitting this model-facing
 * hint improves portability without changing accepted application input.
 */
export function createProviderCompatibleInputSchema<INPUT>(schema: Schema<INPUT>): Schema<INPUT> {
	return jsonSchema<INPUT>(
		async () =>
			JSON.parse(
				JSON.stringify(await schema.jsonSchema, (key, value) =>
					key === "maxItems" ? undefined : value,
				),
			) as ModelJsonSchema,
		schema.validate ? { validate: schema.validate } : {},
	);
}

/**
 * Providers only need a tool's input contract. Keep output schemas inside
 * ThinkEx, where they validate execution results without entering a
 * provider-specific JSON Schema dialect.
 */
export function getModelToolDefinition<
	T extends { modelInputSchema?: unknown; outputSchema?: unknown },
>(definition: T): Omit<T, "modelInputSchema" | "outputSchema"> {
	const { modelInputSchema, outputSchema, ...modelDefinition } = definition;
	void modelInputSchema;
	void outputSchema;
	return modelDefinition;
}

export function requireAIThreadToolRuntime(
	toolName: string,
	aiTool: Tool,
): AIThreadToolRuntime<unknown, unknown> {
	if (!(AI_THREAD_TOOL_RUNTIME in aiTool)) {
		throw new Error(`Code Mode tool "${toolName}" must be defined with defineAIThreadTool`);
	}

	return (aiTool as AIThreadTool<unknown, unknown>)[AI_THREAD_TOOL_RUNTIME];
}

function directExecutionContext(
	options: ToolExecutionOptions<unknown>,
): AIThreadToolExecutionContext {
	return {
		abortSignal: options.abortSignal,
		invocationId: options.toolCallId,
		source: "direct",
	};
}
