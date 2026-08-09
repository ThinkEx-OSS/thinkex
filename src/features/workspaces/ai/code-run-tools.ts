import {
	getSandbox,
	isPlatformTransientError,
	type Sandbox,
	type SandboxOptions,
} from "@cloudflare/sandbox";
import type { JSONValue, ToolSet } from "ai";
import { z } from "zod";
import {
	aiThreadActivityTitleSchema,
	defineAIThreadTool,
} from "#/features/workspaces/ai/ai-thread-tool";

const COMPUTE_LANGUAGE = "python" as const;
const COMPUTE_RUN_TIMEOUT_MS = 120_000;
const AI_THREAD_SANDBOX_OPTIONS = {
	sleepAfter: "30m",
	containerTimeouts: {
		instanceGetTimeoutMS: 60_000,
		portReadyTimeoutMS: 180_000,
	},
} satisfies SandboxOptions;

const codeRunInputSchema = z.object({
	title: aiThreadActivityTitleSchema,
	code: z.string().min(1).describe("Python code to execute in the private code sandbox."),
});
const codeRunErrorSchema = z.object({
	name: z.string(),
	message: z.string(),
	traceback: z.array(z.string()),
	line_number: z.number().int().optional(),
	code: z.string().optional(),
	retryable: z.boolean().optional(),
});
const codeRunOutputSchema = z.object({
	language: z.literal(COMPUTE_LANGUAGE),
	execution_count: z.number().int().optional(),
	logs: z.object({
		stdout: z.array(z.string()),
		stderr: z.array(z.string()),
	}),
	results: z.array(
		z.object({
			text: z.string().optional(),
			html: z.string().optional(),
			png: z.string().optional(),
			jpeg: z.string().optional(),
			svg: z.string().optional(),
			latex: z.string().optional(),
			markdown: z.string().optional(),
			javascript: z.string().optional(),
			json: z.unknown().optional(),
			chart: z.unknown().optional(),
			data: z.unknown().optional(),
		}),
	),
	error: codeRunErrorSchema.optional(),
});

const codeRunInputExamples = [
	{
		input: {
			title: "Solving the production system",
			code: "import numpy as np\nA = np.array([[0.4, 0.1], [0.1, 0.4]])\nnp.linalg.inv(np.eye(2) - A) @ np.array([1400, 2100])",
		},
	},
	{
		input: {
			title: "Plotting the growth curve",
			code: "import matplotlib.pyplot as plt\nplt.plot([1, 2, 3], [1, 4, 9])\nplt.show()",
		},
	},
] satisfies Array<{ input: z.input<typeof codeRunInputSchema> }>;

type CodeRunInput = z.output<typeof codeRunInputSchema>;

type CodeRunResult = Awaited<ReturnType<Sandbox["runCode"]>>;
type CodeRunResultItem = CodeRunResult["results"][number];
type SerializedCodeRunError = {
	name: string;
	message: string;
	traceback: string[];
	line_number?: number;
	code?: string;
	retryable?: boolean;
};

export function createAIThreadCodeRunTools(input: {
	env: Cloudflare.Env;
	sandboxId: string;
}): ToolSet {
	return {
		compute: defineAIThreadTool({
			description:
				"Execute private Python for numeric work you cannot do reliably inline — matrix math, statistics, simulations — and for matplotlib charts. Not for arithmetic, date math, string manipulation, or as a scratchpad for reasoning; do that inline. The sandbox filesystem is empty: it holds no workspace items and no uploads, so read documents with `workspace_read_items` and never by filesystem path. If an import fails the library is not installed; do not retry with a different one. Uses the Sandbox default Python context, so variables can persist across compute calls in the same chat thread. When several runs feed each other, call this from `orchestrate` rather than one compute call per step. The chat UI renders returned image results directly; do not paste base64 image data into the final answer.",
			inputSchema: codeRunInputSchema,
			inputExamples: codeRunInputExamples,
			outputSchema: codeRunOutputSchema,
			toModelOutput: ({ output }) => ({
				type: "json" as const,
				value: {
					...output,
					results: output.results.map(({ png, jpeg, ...result }) => ({
						...result,
						...(png ? { png: "[image rendered in chat]" } : {}),
						...(jpeg ? { jpeg: "[image rendered in chat]" } : {}),
					})),
				} as JSONValue,
			}),
			execute: async (args) => {
				const { code } = args as CodeRunInput;

				try {
					const sandbox = getSandbox(
						input.env.CODE_SANDBOX,
						input.sandboxId,
						AI_THREAD_SANDBOX_OPTIONS,
					);
					const result = await sandbox.runCode(code, {
						language: COMPUTE_LANGUAGE,
						timeout: COMPUTE_RUN_TIMEOUT_MS,
					});

					return serializeCodeRunResult(result);
				} catch (error) {
					return serializeCodeRunFailure(error);
				}
			},
		}),
	};
}

function serializeCodeRunResult(result: CodeRunResult): z.output<typeof codeRunOutputSchema> {
	return {
		language: COMPUTE_LANGUAGE,
		execution_count: result.executionCount,
		logs: result.logs,
		results: result.results.map(serializeCodeRunResultItem),
		error: result.error
			? {
					name: result.error.name,
					message: result.error.message,
					traceback: result.error.traceback,
					line_number: result.error.lineNumber,
				}
			: undefined,
	};
}

function serializeCodeRunResultItem(item: CodeRunResultItem) {
	return {
		text: item.text,
		html: item.html,
		png: item.png,
		jpeg: item.jpeg,
		svg: item.svg,
		latex: item.latex,
		markdown: item.markdown,
		javascript: item.javascript,
		json: item.json,
		chart: item.chart,
		data: item.data,
	};
}

function serializeCodeRunFailure(error: unknown): z.output<typeof codeRunOutputSchema> {
	const details = getCodeRunFailureDetails(error);

	return {
		language: COMPUTE_LANGUAGE,
		logs: {
			stdout: [],
			stderr: [],
		},
		results: [],
		error: {
			name: details.name,
			message: details.message,
			traceback: details.traceback,
			line_number: undefined,
			code: details.code,
			retryable: details.retryable,
		},
	};
}

function getCodeRunFailureDetails(error: unknown) {
	if (error instanceof Error) {
		return {
			name: error.name || "SandboxError",
			message: error.message,
			traceback: [],
			code: getSandboxErrorCode(error),
			retryable: isPlatformTransientError(error),
		} satisfies SerializedCodeRunError;
	}

	return {
		name: "SandboxError",
		message: "The private code sandbox failed before Python execution could start.",
		traceback: [],
		code: undefined,
		retryable: false,
	} satisfies SerializedCodeRunError;
}

function getSandboxErrorCode(error: Error) {
	return "code" in error && typeof error.code === "string" ? error.code : undefined;
}
