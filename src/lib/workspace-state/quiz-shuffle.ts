import type { z } from "zod";
import { generateItemId } from "./item-helpers";
import { quizQuestionInputSchema } from "./item-data-schemas";
import type { QuizQuestion } from "./types";

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export type QuizInputQuestion = z.infer<typeof quizQuestionInputSchema>;

export function materializeQuizQuestion(
  input: QuizInputQuestion,
): QuizQuestion {
  const allTexts = [
    input.correctAnswer,
    ...input.distractors.map((d) => d.text),
  ];
  const normalized = allTexts.map((t) => t.trim().toLowerCase());

  if (new Set(normalized).size !== normalized.length) {
    throw new Error(
      `Quiz question has duplicate option text: ${JSON.stringify(allTexts)}. Each option (including correctAnswer) must be distinct.`,
    );
  }

  const correctText = input.correctAnswer;
  const entries: Array<{ text: string; whyWrong: string | null }> = [
    { text: correctText, whyWrong: null },
    ...input.distractors.map((d) => ({ text: d.text, whyWrong: d.whyWrong })),
  ];
  shuffleInPlace(entries);

  const options = entries.map((e) => e.text);
  const correctIndex = entries.findIndex((e) => e.whyWrong === null);
  const distractorRationales = entries.map((e) => e.whyWrong ?? "");

  return {
    id: generateItemId(),
    question: input.question,
    options,
    correctIndex,
    explanation: input.explanation,
    distractorRationales,
  } satisfies QuizQuestion;
}

export function getQuestionText(q: QuizQuestion): string {
  const newField = q.question?.trim() ? q.question : undefined;
  const legacyField = q.questionText?.trim() ? q.questionText : undefined;

  return newField ?? legacyField ?? "";
}
