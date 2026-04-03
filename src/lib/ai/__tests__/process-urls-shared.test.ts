import { describe, expect, it } from "vitest";
import { normalizeProcessUrlsArgs } from "../process-urls-shared";

describe("normalizeProcessUrlsArgs", () => {
  it("accepts the structured tool input shape", () => {
    expect(
      normalizeProcessUrlsArgs({
        urls: ["https://example.com", "https://vercel.com"],
      }),
    ).toEqual({
      urls: ["https://example.com", "https://vercel.com"],
    });
  });

  it("normalizes legacy jsonInput payloads and drops instruction", () => {
    expect(
      normalizeProcessUrlsArgs({
        jsonInput: JSON.stringify({
          urls: ["https://example.com"],
          instruction: "Extract dates.",
        }),
      }),
    ).toEqual({
      urls: ["https://example.com"],
    });
  });

  it("returns null for malformed payloads", () => {
    expect(normalizeProcessUrlsArgs({ jsonInput: "not-json" })).toBeNull();
    expect(normalizeProcessUrlsArgs({ urls: [] })).toBeNull();
  });
});
