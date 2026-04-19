import { describe, expect, it } from "vitest";
import { getQuestionText, materializeQuizQuestion } from "../quiz-shuffle";

describe("materializeQuizQuestion", () => {
  it("produces 4 options for MC and correctIndex points at correctAnswer", () => {
    const out = materializeQuizQuestion({
      rationale: "tests X",
      question: "What is 2+2?",
      correctAnswer: "4",
      distractors: [
        { text: "3", whyWrong: "off by one" },
        { text: "5", whyWrong: "off by one up" },
        { text: "22", whyWrong: "string concat" },
      ],
      explanation: "Basic addition.",
    });
    expect(out.options).toHaveLength(4);
    expect(out.options[out.correctIndex]).toBe("4");
    expect(out.distractorRationales).toHaveLength(4);
    expect(out.distractorRationales![out.correctIndex]).toBe("");
    expect(out.explanation).toBe("Basic addition.");
    expect(out.question).toBe("What is 2+2?");
    expect(out.type).toBeUndefined();
    expect(out.questionText).toBeUndefined();
  });

  it("produces 2 options for true/false and correctIndex points at correctAnswer", () => {
    const out = materializeQuizQuestion({
      rationale: "tests Y",
      question: "All primes are odd?",
      correctAnswer: "False",
      distractors: [{ text: "True", whyWrong: "forgets 2" }],
      explanation: "2 is prime and even.",
    });
    expect(out.options).toHaveLength(2);
    expect(out.options[out.correctIndex]).toBe("False");
    expect(out.distractorRationales![out.correctIndex]).toBe("");
    const distractorIdx = 1 - out.correctIndex;
    expect(out.distractorRationales![distractorIdx]).toBe("forgets 2");
  });

  it("gives each question a unique id", () => {
    const q1 = materializeQuizQuestion({
      rationale: "a",
      question: "q1",
      correctAnswer: "A",
      distractors: [
        { text: "B", whyWrong: "x" },
        { text: "C", whyWrong: "y" },
        { text: "D", whyWrong: "z" },
      ],
      explanation: "e",
    });
    const q2 = materializeQuizQuestion({
      rationale: "a",
      question: "q2",
      correctAnswer: "A",
      distractors: [
        { text: "B", whyWrong: "x" },
        { text: "C", whyWrong: "y" },
        { text: "D", whyWrong: "z" },
      ],
      explanation: "e",
    });
    expect(q1.id).not.toBe(q2.id);
  });
});

describe("getQuestionText", () => {
  it("prefers new field", () => {
    expect(
      getQuestionText({
        id: "x",
        question: "new",
        questionText: "old",
        options: [],
        correctIndex: 0,
      } as any),
    ).toBe("new");
  });

  it("falls back to legacy field", () => {
    expect(
      getQuestionText({
        id: "x",
        questionText: "old",
        options: [],
        correctIndex: 0,
      } as any),
    ).toBe("old");
  });

  it("returns empty string when neither present", () => {
    expect(
      getQuestionText({
        id: "x",
        options: [],
        correctIndex: 0,
      } as any),
    ).toBe("");
  });
});
