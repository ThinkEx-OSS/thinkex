import type { ToolSet } from "ai";
import { z } from "zod";

import { defineAIThreadTool } from "#/features/workspaces/ai/ai-thread-tool";

export const ASK_USER_TOOL_NAME = "ask_user";

const MAX_QUESTIONS = 4;
const MAX_OPTIONS = 4;

// Deliberately NOT a blocking tool. `execute` records what was asked and
// returns immediately; the turn then ends via the endpoint's
// hasToolCall(ASK_USER_TOOL_NAME) stop condition, and the user's reply arrives
// as an ordinary user message on the next turn.
//
// The alternative — a tool that awaits the answer — would park a Worker
// request on a human, hold the turn claim, and lose the question on refresh.
// Completing the call up front instead means the question survives into every
// later turn's model context (convertToModelMessages drops tool parts that
// never reached an output-* state) and renders as a settled tool row rather
// than a permanent spinner.
const questionOptionSchema = z.object({
	label: z
		.string()
		.trim()
		.min(1)
		.max(60)
		.describe("Display text for the choice. 1-5 words, concise."),
	description: z
		.string()
		.trim()
		.min(1)
		.max(200)
		.describe("What picking this choice means or implies."),
});

const questionSchema = z.object({
	header: z
		.string()
		.trim()
		.min(1)
		.max(30)
		.describe("Very short label for the question, at most 30 characters. Example: 'Auth method'."),
	question: z.string().trim().min(1).max(300).describe("The complete question to ask."),
	options: z
		.array(questionOptionSchema)
		.min(2)
		.max(MAX_OPTIONS)
		.describe(
			"The choices offered. Do not include an 'Other' or catch-all option — a free-text answer is always available to the user.",
		),
	multiple: z
		.boolean()
		.default(false)
		.describe("Set when the user may pick more than one option. Defaults to single-select."),
});

/** Also the client's parser for a pending question's tool input. */
export const askUserInputSchema = z.object({
	questions: z
		.array(questionSchema)
		.min(1)
		.max(MAX_QUESTIONS)
		.describe("The questions to put to the user, asked together on one screen."),
});

const askUserOutputSchema = z.object({
	asked: z.array(
		z.object({
			header: z.string(),
			question: z.string(),
			options: z.array(z.string()),
			multiple: z.boolean(),
		}),
	),
});

const askUserInputExamples = [
	{
		input: {
			questions: [
				{
					header: "Study format",
					question: "How should I structure the study guide?",
					options: [
						{ label: "Summary first", description: "Key points up front, then detail per topic." },
						{ label: "Question bank", description: "Practice questions with worked answers." },
					],
					multiple: false,
				},
			],
		},
	},
];

const description = `Ask the user one or more multiple-choice questions and end your turn so they can answer.

Use this when a genuine fork in the work needs their input: an ambiguous instruction, a preference you cannot infer, or a choice between directions with real trade-offs. Do not use it for questions you can answer yourself from the workspace, and do not use it to confirm work you have already been asked to do.

How it behaves:
- Your turn ENDS as soon as you call this. Say anything you need to say BEFORE calling it, and do not call any other tool in the same step.
- The user's answers arrive as their next message. You do not receive them as this tool's result.
- Each question needs 2-4 options. A free-text answer is always offered automatically, so never write an "Other" option yourself.
- If you recommend an option, put it first and end its label with "(Recommended)".
- Set multiple: true when several answers can apply at once.
- The user may skip. If they do, proceed on your best judgement rather than asking again.`;

/**
 * The clarification tool. Its result records the question for later turns; the
 * answer itself travels back as a normal user message.
 */
export function createAIThreadQuestionTools(): ToolSet {
	return {
		[ASK_USER_TOOL_NAME]: defineAIThreadTool({
			description,
			inputSchema: askUserInputSchema,
			inputExamples: askUserInputExamples,
			outputSchema: askUserOutputSchema,
			toModelOutput: ({ output }) => ({
				type: "text" as const,
				value: formatAskUserModelOutput(output),
			}),
			execute: (input) => ({
				asked: input.questions.map((question) => ({
					header: question.header,
					question: question.question,
					options: question.options.map((option) => option.label),
					multiple: question.multiple,
				})),
			}),
		}),
	};
}

// What the model reads on later turns. The answer is NOT here — it arrives as
// the user's next message — so this only has to keep the question and its
// options in context, which is what stops the model re-asking after a skip.
function formatAskUserModelOutput(output: z.output<typeof askUserOutputSchema>) {
	const asked = output.asked
		.map((entry) => `- ${entry.header}: "${entry.question}" (${entry.options.join(" / ")})`)
		.join("\n");

	return `Asked the user and ended the turn:\n${asked}\n\nTheir reply is their next message. If they skipped, continue on your best judgement instead of asking again.`;
}
