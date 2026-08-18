import { isToolUIPart } from "ai";
import { z } from "zod";

import { ASK_USER_TOOL_NAME, askUserInputSchema } from "#/features/workspaces/ai/question-tools";
import type { AiChatMessage } from "#/features/workspaces/components/ai-chat/types";
import { getToolPartName } from "#/features/workspaces/components/ai-chat/ai-chat-display-state";

export type AiChatQuestion = z.output<typeof askUserInputSchema>["questions"][number];

/**
 * One question's answer: the labels chosen, or a skip. Schema-first because it
 * round-trips through the message's jsonb metadata, where nothing else checks
 * its shape — see getQuestionAnswerMetadata.
 */
const questionAnswerSchema = z.object({
	header: z.string(),
	question: z.string(),
	values: z.array(z.string()),
	skipped: z.boolean(),
});
const questionAnswersSchema = z.array(questionAnswerSchema);

export type AiChatQuestionAnswer = z.output<typeof questionAnswerSchema>;

/**
 * The questions awaiting an answer, if any. They are pending only while their
 * assistant message is the last in the thread — anything sent after it (an
 * answer, or the user ignoring it and typing) settles them, exactly as the
 * model sees it.
 *
 * Every completed call contributes: the model can emit parallel tool calls in
 * one step, and stopping at the first would drop the rest with no trace.
 */
export function getPendingQuestions(messages: AiChatMessage[]): AiChatQuestion[] | null {
	const last = messages.at(-1);

	if (last?.role !== "assistant") {
		return null;
	}

	const questions = last.parts.flatMap((part): AiChatQuestion[] => {
		// Only a completed call carries a question worth showing. An errored one
		// (an interrupted turn, via settledParts) has nothing to ask — and having
		// reached an output, its input is known to satisfy the schema.
		if (
			!isToolUIPart(part) ||
			getToolPartName(part) !== ASK_USER_TOOL_NAME ||
			part.state !== "output-available"
		) {
			return [];
		}

		const parsed = askUserInputSchema.safeParse(part.input);
		return parsed.success ? [...parsed.data.questions] : [];
	});

	return questions.length > 0 ? questions : null;
}

/**
 * Answers ride the user message's metadata, which is persisted verbatim into
 * jsonb — `validateUIMessages` runs without a metadataSchema and its result is
 * discarded. Nothing else vouches for the shape, so old rows written before a
 * field changed would otherwise reach the renderer and throw mid-transcript.
 */
export function getQuestionAnswerMetadata(message: AiChatMessage): AiChatQuestionAnswer[] | null {
	const metadata = message.metadata as { questionAnswer?: unknown } | undefined;
	const parsed = questionAnswersSchema.safeParse(metadata?.questionAnswer);

	return parsed.success && parsed.data.length > 0 ? parsed.data : null;
}

/**
 * The text the model reads. It has to stand on its own: the answer arrives as
 * an ordinary user message, with nothing tying it back to the question but the
 * words in it.
 */
export function formatQuestionAnswerText(answers: AiChatQuestionAnswer[]): string {
	if (answers.every((answer) => answer.skipped)) {
		return "I'd rather not answer that — use your best judgement and keep going.";
	}

	return answers
		.map((answer) =>
			answer.skipped
				? `${answer.header}: (skipped — your call)`
				: `${answer.header}: ${answer.values.join(", ")}`,
		)
		.join("\n");
}
