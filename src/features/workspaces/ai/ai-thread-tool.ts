import type { FlexibleSchema, Tool, ToolExecutionOptions } from "ai";
import { asSchema, tool } from "ai";

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

type AIThreadTool<INPUT, OUTPUT> = Tool<INPUT, OUTPUT> & {
	[AI_THREAD_TOOL_RUNTIME]: AIThreadToolRuntime<INPUT, OUTPUT>;
};

type AIThreadToolDefinition<INPUT, OUTPUT> = Pick<
	Tool<INPUT, OUTPUT>,
	| "description"
	| "inputExamples"
	| "inputSchema"
	| "metadata"
	| "needsApproval"
	| "providerOptions"
	| "strict"
	| "title"
> & {
	execute(
		this: void,
		input: INPUT,
		context: AIThreadToolExecutionContext,
	): OUTPUT | PromiseLike<OUTPUT>;
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
	const inputSchema = asSchema(definition.inputSchema);
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
	const aiTool = tool<INPUT, OUTPUT>({
		...definition,
		execute: (input: INPUT, options: ToolExecutionOptions) =>
			runtime.execute(input, directExecutionContext(options)),
	} as unknown as Tool<INPUT, OUTPUT>);

	return Object.assign(aiTool, { [AI_THREAD_TOOL_RUNTIME]: runtime });
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

function directExecutionContext(options: ToolExecutionOptions): AIThreadToolExecutionContext {
	return {
		abortSignal: options.abortSignal,
		invocationId: options.toolCallId,
		source: "direct",
	};
}
