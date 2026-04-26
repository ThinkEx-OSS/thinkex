import { describe, expect, it } from "vitest";
import {
  MAX_WEB_MAP_LIMIT_HARD_CAP,
  WebMapInputSchema,
  normalizeWebMapArgs,
} from "../web-map-shared";

describe("normalizeWebMapArgs", () => {
  it("accepts the structured tool input shape", () => {
    expect(normalizeWebMapArgs({ url: "https://example.com" })).toEqual({
      url: "https://example.com",
    });
  });

  it("parses optional fields", () => {
    expect(
      normalizeWebMapArgs({
        url: "https://example.com",
        limit: 5,
        search: "foo",
      }),
    ).toEqual({
      url: "https://example.com",
      limit: 5,
      search: "foo",
    });
  });

  it("normalizes legacy jsonInput payloads", () => {
    expect(
      normalizeWebMapArgs({
        jsonInput: JSON.stringify({ url: "https://example.com" }),
      }),
    ).toEqual({ url: "https://example.com" });
  });

  it("returns null for malformed jsonInput", () => {
    expect(normalizeWebMapArgs({ jsonInput: "not-json" })).toBeNull();
  });

  it("returns null for empty payload", () => {
    expect(normalizeWebMapArgs({})).toBeNull();
  });

  it("returns null when url is empty", () => {
    expect(normalizeWebMapArgs({ url: "" })).toBeNull();
  });
});

describe("WebMapInputSchema", () => {
  it("rejects limit greater than MAX_WEB_MAP_LIMIT_HARD_CAP", () => {
    const result = WebMapInputSchema.safeParse({
      url: "https://example.com",
      limit: MAX_WEB_MAP_LIMIT_HARD_CAP + 1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts limit at MAX_WEB_MAP_LIMIT_HARD_CAP", () => {
    const result = WebMapInputSchema.safeParse({
      url: "https://example.com",
      limit: MAX_WEB_MAP_LIMIT_HARD_CAP,
    });
    expect(result.success).toBe(true);
  });
});
