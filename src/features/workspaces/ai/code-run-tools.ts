import { getSandbox, type Sandbox } from "@cloudflare/sandbox";
import type { ToolSet } from "ai";
import { tool } from "ai";
import { z } from "zod";

const codeRunLanguageSchema = z.enum(["python", "javascript", "typescript"]);

const codeRunInputSchema = z.object({
	language: codeRunLanguageSchema.optional().describe("Language to execute. Defaults to python."),
	code: z.string().min(1).describe("Code to execute in the private code sandbox."),
});

const codeRunInputExamples = [
	{
		input: {
			language: "python",
			code: "import math\nmath.pi * 5 ** 2",
		},
	},
	{
		input: {
			language: "python",
			code: "import matplotlib.pyplot as plt\nplt.plot([1, 2, 3], [1, 4, 9])\nplt.show()",
		},
	},
] satisfies Array<{ input: z.input<typeof codeRunInputSchema> }>;

type CodeRunInput = z.output<typeof codeRunInputSchema>;

type CodeRunResult = Awaited<ReturnType<Sandbox["runCode"]>>;
type CodeRunResultItem = CodeRunResult["results"][number];

export function createAIThreadCodeRunTools(input: {
	env: Cloudflare.Env;
	sandboxId: string;
}): ToolSet {
	return {
		compute: tool({
			description:
				"Execute private Python, JavaScript, or TypeScript code for calculations, data analysis, tables, and charts. Uses the Sandbox default context for the selected language, so variables can persist across compute calls in the same chat thread. The chat UI renders returned image results directly; do not paste base64 image data into the final answer.",
			inputSchema: codeRunInputSchema,
			inputExamples: codeRunInputExamples,
			strict: true,
			execute: async (args) => {
				const { code, language = "python" } = args as CodeRunInput;
				const sandbox = getSandbox(input.env.CODE_SANDBOX, input.sandboxId);
				const result = await sandbox.runCode(code, {
					language,
				});

				return serializeCodeRunResult(result, language);
			},
		}),
	};
}

function serializeCodeRunResult(
	result: CodeRunResult,
	language: z.output<typeof codeRunLanguageSchema>,
) {
	return {
		language,
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
