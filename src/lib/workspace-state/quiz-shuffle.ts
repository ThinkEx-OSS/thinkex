import type { QuizQuestion } from "./types";
import { generateItemId } from "./item-helpers";

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface QuizInputQuestion {
  rationale: string;
  question: string;
  correctAnswer: string;
  distractors: Array<{ text: string; whyWrong: string }>;
  explanation: string;
}

export function materializeQuizQuestion(
  input: QuizInputQuestion,
): QuizQuestion {
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
  return q.question ?? q.questionText ?? "";
}
