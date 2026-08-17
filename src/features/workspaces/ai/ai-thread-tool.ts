import type { FlexibleSchema, Schema, Tool, ToolExecutionOptions } from "ai";
import { asSchema, jsonSchema, tool } from "ai";

export interface AIThreadToolExecutionContext {
	abortSignal?: AbortSignal;
	invocationId: string;
}

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
 * The original schemas a tool was defined with, for consumers that need the
 * real contract rather than the provider-flattened one — Code Mode type
 * generation renders TypeScript from these.
 */
export interface AIThreadToolRuntime {
	inputSchema: FlexibleSchema<unknown>;
	outputSchema: FlexibleSchema<unknown>;
}

const toolRuntimes = new WeakMap<object, AIThreadToolRuntime>();

/**
 * Look up the original schemas of a tool created by {@link defineAIThreadTool}.
 *
 * @param toolName - The tool's name, for the defect message only.
 * @param aiTool - The tool object returned by `defineAIThreadTool`.
 * @returns The tool's original input and output schemas.
 * @throws When the tool was not created via `defineAIThreadTool` — every
 *   first-party chat tool must be.
 */
export function requireAIThreadToolRuntime(toolName: string, aiTool: object): AIThreadToolRuntime {
	const runtime = toolRuntimes.get(aiTool);

	if (!runtime) {
		throw new Error(`Tool "${toolName}" was not defined via defineAIThreadTool`);
	}

	return runtime;
}

/**
 * Defines a first-party tool with runtime-validated input and output. The
 * output schema stays application-side (providers only need the input
 * contract), and the model-facing input schema is made provider-portable.
 */
export function defineAIThreadTool<INPUT, OUTPUT>(
	definition: AIThreadToolDefinition<INPUT, OUTPUT>,
): Tool<any, any, any> {
	const { modelInputSchema: rawModelInputSchema, outputSchema, ...modelDefinition } = definition;
	const inputSchema = asSchema(definition.inputSchema);
	const modelInputSchema = createProviderCompatibleInputSchema(
		rawModelInputSchema ? asSchema(rawModelInputSchema) : inputSchema,
	);
	const validatedOutputSchema = asSchema(outputSchema);

	if (!inputSchema.validate || !validatedOutputSchema.validate) {
		throw new Error("AI thread tools require runtime-validatable input and output schemas");
	}

	const validateInput = inputSchema.validate;
	const validateOutput = validatedOutputSchema.validate;

	const created = tool<INPUT, OUTPUT, Record<string, unknown>>({
		...modelDefinition,
		inputSchema: modelInputSchema,
		execute: async (input: INPUT, options: ToolExecutionOptions<unknown>) => {
			const validatedInput = await validateInput(input);
			if (!validatedInput.success) {
				throw validatedInput.error;
			}

			const output = await definition.execute(validatedInput.value, {
				abortSignal: options.abortSignal,
				invocationId: options.toolCallId,
			});
			const validatedOutput = await validateOutput(output);
			if (!validatedOutput.success) {
				throw validatedOutput.error;
			}

			return validatedOutput.value;
		},
	} as unknown as Tool<INPUT, OUTPUT, Record<string, unknown>>) as Tool<any, any, any>;

	toolRuntimes.set(created, {
		// SAFETY: FlexibleSchema is read here only to render JSON Schema /
		// TypeScript types, never to produce typed values, so widening the
		// generic to unknown cannot be misused.
		inputSchema: definition.inputSchema as FlexibleSchema<unknown>,
		outputSchema: outputSchema as FlexibleSchema<unknown>,
	});

	return created;
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
