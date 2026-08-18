import { describe, expect, it } from "vitest";

import {
	formatQuestionAnswerText,
	getPendingQuestions,
	getQuestionAnswerMetadata,
} from "#/features/workspaces/components/ai-chat/ai-chat-question";
import type { AiChatMessage } from "#/features/workspaces/components/ai-chat/types";

function askUserPart(header: string, state = "output-available") {
	return {
		type: "tool-ask_user",
		toolCallId: `call-${header}`,
		state,
		input: {
			questions: [
				{
					header,
					question: `What about ${header}?`,
					options: [
						{ label: "Yes", description: "Go ahead." },
						{ label: "No", description: "Do not." },
					],
					multiple: false,
				},
			],
		},
		output: { asked: [] },
	};
}

function assistant(parts: unknown[]): AiChatMessage {
	return { id: "m1", role: "assistant", parts } as unknown as AiChatMessage;
}

const userMessage = { id: "m2", role: "user", parts: [] } as unknown as AiChatMessage;

describe("getPendingQuestions", () => {
	it("surfaces a completed question on the last assistant message", () => {
		const questions = getPendingQuestions([assistant([askUserPart("Format")])]);

		expect(questions).toHaveLength(1);
		expect(questions?.[0]?.header).toBe("Format");
	});

	it("collects every call — the model can ask twice in one step", () => {
		const questions = getPendingQuestions([
			assistant([askUserPart("Format"), askUserPart("Depth")]),
		]);

		expect(questions?.map((question) => question.header)).toEqual(["Format", "Depth"]);
	});

	// Anything sent after the question settles it, which is what makes the UI's
	// idea of "still pending" the same fact the model reads.
	it("settles once any message follows", () => {
		expect(getPendingQuestions([assistant([askUserPart("Format")]), userMessage])).toBeNull();
	});

	it("ignores a call that never reached an output", () => {
		expect(getPendingQuestions([assistant([askUserPart("Format", "output-error")])])).toBeNull();
	});
});

describe("getQuestionAnswerMetadata", () => {
	const answers = [{ header: "Format", question: "Which?", values: ["Yes"], skipped: false }];

	it("reads back answers it wrote", () => {
		const message = { id: "m", role: "user", parts: [], metadata: { questionAnswer: answers } };

		expect(getQuestionAnswerMetadata(message as unknown as AiChatMessage)).toEqual(answers);
	});

	// Metadata lands in jsonb unvalidated, so a row written before a field
	// changed must fall back to plain text rather than reach the renderer.
	it("rejects a malformed entry instead of handing it to the renderer", () => {
		const message = {
			id: "m",
			role: "user",
			parts: [],
			metadata: { questionAnswer: [{ header: "Format" }] },
		};

		expect(getQuestionAnswerMetadata(message as unknown as AiChatMessage)).toBeNull();
	});

	it("returns null when there is no question metadata", () => {
		const message = { id: "m", role: "user", parts: [], metadata: { modelId: "gemini" } };

		expect(getQuestionAnswerMetadata(message as unknown as AiChatMessage)).toBeNull();
	});
});

describe("formatQuestionAnswerText", () => {
	// The model never sees the question again except through this text.
	it("names the question alongside the answer", () => {
		expect(
			formatQuestionAnswerText([
				{ header: "Format", question: "Which?", values: ["Summary", "Quiz"], skipped: false },
			]),
		).toBe("Format: Summary, Quiz");
	});

	it("hands the decision back when everything was skipped", () => {
		expect(
			formatQuestionAnswerText([
				{ header: "Format", question: "Which?", values: [], skipped: true },
			]),
		).toContain("best judgement");
	});

	it("keeps the answered questions when only some were skipped", () => {
		expect(
			formatQuestionAnswerText([
				{ header: "Format", question: "Which?", values: ["Summary"], skipped: false },
				{ header: "Depth", question: "How deep?", values: [], skipped: true },
			]),
		).toBe("Format: Summary\nDepth: (skipped — your call)");
	});
});
