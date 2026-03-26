import { describe, expect, it } from "vitest";
import { filterOcrCandidates, OCR_BATCH_THRESHOLD, selectOcrMode } from "../dispatch";
import type { OcrCandidate } from "../types";

describe("ocr dispatch", () => {
  it("filters invalid OCR candidates", () => {
    const candidates = [
      { itemId: "doc-1", itemType: "file", fileUrl: "https://example.com/a.pdf" },
      { itemId: "", itemType: "file", fileUrl: "https://example.com/b.pdf" },
      { itemId: "img-1", itemType: "image", fileUrl: "" },
      { itemId: "img-2", itemType: "image", fileUrl: "https://example.com/c.png" },
    ] as OcrCandidate[];

    expect(filterOcrCandidates(candidates)).toEqual([
      { itemId: "doc-1", itemType: "file", fileUrl: "https://example.com/a.pdf" },
      { itemId: "img-2", itemType: "image", fileUrl: "https://example.com/c.png" },
    ]);
  });

  it("uses batch mode at the threshold and direct mode below it", () => {
    expect(selectOcrMode(OCR_BATCH_THRESHOLD - 1)).toBe("direct");
    expect(selectOcrMode(OCR_BATCH_THRESHOLD)).toBe("batch");
  });
});
