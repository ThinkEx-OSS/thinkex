import { describe, expect, it } from "vitest";
import { normalizeProcessUrlsArgs } from "../process-urls-shared";

describe("normalizeProcessUrlsArgs", () => {
  it("accepts the structured tool input shape", () => {
    expect(
      normalizeProcessUrlsArgs({
        urls: ["https://example.com", "https://vercel.com"],
        instruction: "Summarize the key points.",
      }),
    ).toEqual({
      urls: ["https://example.com", "https://vercel.com"],
      instruction: "Summarize the key points.",
    });
  });

  it("normalizes legacy jsonInput payloads", () => {
    expect(
      normalizeProcessUrlsArgs({
        jsonInput: JSON.stringify({
          urls: ["https://example.com"],
          instruction: "Extract dates.",
        }),
      }),
    ).toEqual({
      urls: ["https://example.com"],
      instruction: "Extract dates.",
    });
  });

  it("returns null for malformed payloads", () => {
    expect(normalizeProcessUrlsArgs({ jsonInput: "not-json" })).toBeNull();
    expect(normalizeProcessUrlsArgs({ urls: [] })).toBeNull();
  });
});
