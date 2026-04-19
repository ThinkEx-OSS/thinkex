import { describe, expect, it } from "vitest";
import { parseJsonWithRepair } from "@/lib/utils/json-repair";

describe("parseJsonWithRepair", () => {
  it("parses valid JSON without repair", () => {
    const input = '{"name":"test","items":[1,2,3]}';
    const result = parseJsonWithRepair<{ name: string; items: number[] }>(
      input,
    );
    expect(result.repaired).toBe(false);
    expect(result.value.name).toBe("test");
    expect(result.value.items).toEqual([1, 2, 3]);
  });

  it("repairs missing closing bracket", () => {
    const result = parseJsonWithRepair<{ name: string }>('{"name":"test"');
    expect(result.repaired).toBe(true);
    expect(result.value.name).toBe("test");
  });

  it("repairs single quotes and unquoted keys", () => {
    const result = parseJsonWithRepair<{ name: string; score: number }>(
      "{name: 'test', score: 42}",
    );
    expect(result.repaired).toBe(true);
    expect(result.value).toEqual({ name: "test", score: 42 });
  });

  it("repairs trailing commas", () => {
    const result = parseJsonWithRepair<{ items: number[] }>(
      '{"items":[1,2,3,],}',
    );
    expect(result.repaired).toBe(true);
    expect(result.value.items).toEqual([1, 2, 3]);
  });

  it("repairs malformed appended quiz JSON with trailing comma", () => {
    const malformed = `
      {
        "questions": [
          {"id":"q1","type":"multiple_choice","questionText":"Q1","options":["A","B","C","D"],"correctIndex":0},
        ],
      }
    `;
    const result = parseJsonWithRepair<{ questions: unknown[] }>(malformed);
    expect(Array.isArray(result.value.questions)).toBe(true);
    expect(result.value.questions).toHaveLength(1);
  });

  it("parses new quiz question shape with explanation", () => {
    const input =
      '{"questions":[{"id":"q1","question":"Q?","options":["a","b","c","d"],"correctIndex":2,"explanation":"because reasons","distractorRationales":["wrong1","wrong2","","wrong3"]}]}';
    const result = parseJsonWithRepair<{
      questions: Array<Record<string, unknown>>;
    }>(input);
    expect(result.value.questions).toHaveLength(1);
    const q = result.value.questions[0];
    expect(q.question).toBe("Q?");
    expect(q.correctIndex).toBe(2);
    expect(q.explanation).toBe("because reasons");
    expect(q.distractorRationales).toEqual(["wrong1", "wrong2", "", "wrong3"]);
    expect(q.type).toBeUndefined();
    expect(q.questionText).toBeUndefined();
  });

  it("repairs malformed appended flashcard JSON with single quotes", () => {
    const malformed = "{cards: [{'id':'c1','front':'f1','back':'b1'}],}";
    const result = parseJsonWithRepair<{ cards: Array<{ id: string }> }>(
      malformed,
    );
    expect(result.value.cards[0].id).toBe("c1");
  });

  it("repairs JSON wrapped in code fences", () => {
    const result = parseJsonWithRepair<{ questions: unknown[] }>(
      '```json\n{"questions":[]}\n```',
    );
    expect(result.value.questions).toEqual([]);
  });

  it("repairs fenced JSON without newline before closing fence", () => {
    const result = parseJsonWithRepair<{ questions: unknown[] }>(
      '```json\n{"questions":[]}```',
    );
    expect(result.value.questions).toEqual([]);
  });

  it("removes basic comments", () => {
    const result = parseJsonWithRepair<{ name: string; items: number[] }>(`
      {
        // comment
        "name": "test",
        /* block */
        "items": [1, 2]
      }
    `);
    expect(result.value).toEqual({ name: "test", items: [1, 2] });
  });

  it("repairs token placeholders as best-effort JSON", () => {
    const result = parseJsonWithRepair<{ name?: unknown }>('{"name": ??? }');
    expect(result.repaired).toBe(true);
    expect(typeof result.value).toBe("object");
    expect(result.value).not.toBeNull();
  });

  it("throws for unrecoverable empty input", () => {
    expect(() => parseJsonWithRepair("")).toThrow(
      /Invalid JSON after repair attempt/,
    );
  });
});
