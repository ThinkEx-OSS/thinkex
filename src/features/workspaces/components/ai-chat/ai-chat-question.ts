import { isToolUIPart } from "ai";
import type { z } from "zod";

import { ASK_USER_TOOL_NAME, askUserInputSchema } from "#/features/workspaces/ai/question-tools";
import type { AiChatMessage } from "#/features/workspaces/components/ai-chat/types";
import { getToolPartName } from "#/features/workspaces/components/ai-chat/ai-chat-display-state";

export type AiChatQuestion = z.output<typeof askUserInputSchema>["questions"][number];

export interface AiChatPendingQuestion {
	toolCallId: string;
	questions: AiChatQuestion[];
}

/** One question's answer: the labels chosen, or a skip. */
export interface AiChatQuestionAnswer {
	header: string;
	question: string;
	values: string[];
	skipped: boolean;
}

/**
 * The question awaiting an answer, if any. A question is pending only while its
 * assistant message is the last in the thread — anything sent after it (an
 * answer, or the user ignoring it and typing) settles it, exactly as the model
 * sees it.
 */
export function getPendingQuestion(messages: AiChatMessage[]): AiChatPendingQuestion | null {
	const last = messages.at(-1);

	if (last?.role !== "assistant") {
		return null;
	}

	for (const part of last.parts) {
		if (!isToolUIPart(part) || getToolPartName(part) !== ASK_USER_TOOL_NAME) {
			continue;
		}

		// Only a completed call carries a question worth showing. An errored one
		// (an interrupted turn, via settledParts) has nothing to ask — and having
		// reached an output, its input is known to satisfy the schema below.
		if (part.state !== "output-available") {
			continue;
		}

		const parsed = askUserInputSchema.safeParse(part.input);

		if (parsed.success) {
			return { toolCallId: part.toolCallId, questions: [...parsed.data.questions] };
		}
	}

	return null;
}

export function getQuestionAnswerMetadata(message: AiChatMessage): AiChatQuestionAnswer[] | null {
	const metadata = message.metadata as { questionAnswer?: AiChatQuestionAnswer[] } | undefined;

	return Array.isArray(metadata?.questionAnswer) ? metadata.questionAnswer : null;
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
