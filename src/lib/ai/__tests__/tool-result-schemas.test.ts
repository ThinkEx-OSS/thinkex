import { describe, expect, it } from "vitest";
import { parseStringResult } from "../tool-result-schemas";

describe("parseStringResult", () => {
  it("returns a raw string unchanged", () => {
    expect(parseStringResult("plain markdown")).toBe("plain markdown");
  });

  it("unwraps string-like object payloads", () => {
    expect(parseStringResult({ value: "wrapped markdown" })).toBe("wrapped markdown");
    expect(parseStringResult({ text: "tool output" })).toBe("tool output");
    expect(parseStringResult({ result: "final answer" })).toBe("final answer");
  });

  it("still rejects objects without a string payload", () => {
    expect(() => parseStringResult({ ok: true })).toThrow("Invalid StringResult payload");
  });
});
