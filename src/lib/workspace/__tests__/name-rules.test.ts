import { describe, expect, it } from "vitest";
import {
  MAX_ITEM_NAME_LENGTH,
  validateItemName,
} from "@/lib/workspace/name-rules";

describe("validateItemName", () => {
  it("rejects empty after trim", () => {
    expect(validateItemName("")).toEqual({
      valid: false,
      error: "Name cannot be empty",
    });
    expect(validateItemName("   hello   ")).toEqual({
      valid: true,
      normalized: "hello",
    });
  });

  it("rejects whitespace-only names", () => {
    expect(validateItemName("   ")).toEqual({
      valid: false,
      error: "Name cannot be empty",
    });
  });

  it("rejects non-string input", () => {
    expect(validateItemName(null)).toEqual({
      valid: false,
      error: "Name must be a string",
    });
    expect(validateItemName(123)).toEqual({
      valid: false,
      error: "Name must be a string",
    });
  });

  it("rejects names longer than 255 characters", () => {
    expect(validateItemName("a".repeat(MAX_ITEM_NAME_LENGTH + 1))).toEqual({
      valid: false,
      error: `Name is too long (max ${MAX_ITEM_NAME_LENGTH} characters)`,
    });
  });

  it("rejects each banned character", () => {
    for (const ch of ["/", "\\", "<", ">", ":", '"', "|", "?", "*", "\u0001"]) {
      expect(validateItemName(`bad${ch}name`)).toEqual({
        valid: false,
        error: 'Name cannot contain: / \\ < > : " | ? * or control characters',
      });
    }
  });

  it("rejects reserved names", () => {
    expect(validateItemName(".")).toEqual({
      valid: false,
      error: '"." is a reserved name',
    });
    expect(validateItemName("..")).toEqual({
      valid: false,
      error: '".." is a reserved name',
    });
  });

  it("accepts plain ascii, unicode, emoji, and middle spaces unchanged", () => {
    for (const raw of [
      "Plain ASCII",
      "Résumé notes",
      "📘 Study Plan",
      "name with middle spaces",
    ]) {
      expect(validateItemName(raw)).toEqual({
        valid: true,
        normalized: raw.trim(),
      });
    }
  });

  it("trims leading and trailing spaces", () => {
    expect(validateItemName("  My Name  ")).toEqual({
      valid: true,
      normalized: "My Name",
    });
  });

  it("accepts 255 characters and rejects 256", () => {
    expect(validateItemName("a".repeat(MAX_ITEM_NAME_LENGTH))).toEqual({
      valid: true,
      normalized: "a".repeat(MAX_ITEM_NAME_LENGTH),
    });
    expect(validateItemName("a".repeat(MAX_ITEM_NAME_LENGTH + 1))).toEqual({
      valid: false,
      error: `Name is too long (max ${MAX_ITEM_NAME_LENGTH} characters)`,
    });
  });

  it("keeps default names valid and unchanged", () => {
    for (const raw of [
      "New Document 1",
      "New Quiz 3",
      "New Flashcard 12",
    ]) {
      expect(validateItemName(raw)).toEqual({
        valid: true,
        normalized: raw,
      });
    }
  });
});
