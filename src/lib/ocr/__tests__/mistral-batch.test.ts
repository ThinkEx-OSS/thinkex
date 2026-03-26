import { describe, expect, it } from "vitest";
import { mapBatchResults } from "../mistral-batch";
import type { OcrCandidate } from "../types";

describe("mapBatchResults", () => {
  it("maps mixed batch OCR responses back to candidates", () => {
    const candidates: OcrCandidate[] = [
      { itemId: "doc-1", itemType: "file", fileUrl: "https://example.com/a.pdf" },
      { itemId: "img-1", itemType: "image", fileUrl: "https://example.com/b.png" },
      { itemId: "doc-2", itemType: "file", fileUrl: "https://example.com/c.pdf" },
    ];

    const results = mapBatchResults(
      candidates,
      [
        {
          custom_id: "doc-1",
          response: {
            status_code: 200,
            body: {
              pages: [
                { index: 10, markdown: "first" },
                { index: 11, markdown: "second" },
              ],
            },
          },
          error: null,
        },
        {
          custom_id: "img-1",
          response: {
            status_code: 500,
          },
          error: {
            message: "image OCR failed",
          },
        },
      ] as any,
      []
    );

    expect(results).toEqual([
      {
        itemId: "doc-1",
        itemType: "file",
        ok: true,
        pages: [
          { index: 0, markdown: "first" },
          { index: 1, markdown: "second" },
        ],
      },
      {
        itemId: "img-1",
        itemType: "image",
        ok: false,
        error: "image OCR failed",
      },
      {
        itemId: "doc-2",
        itemType: "file",
        ok: false,
        error: "Batch OCR did not return a result for this item",
      },
    ]);
  });

  it("uses error file entries when present", () => {
    const candidates: OcrCandidate[] = [
      { itemId: "img-2", itemType: "image", fileUrl: "https://example.com/d.png" },
    ];

    const results = mapBatchResults(
      candidates,
      [],
      [
        {
          custom_id: "img-2",
          error: {
            message: "rate limited",
          },
        },
      ] as any,
    );

    expect(results).toEqual([
      {
        itemId: "img-2",
        itemType: "image",
        ok: false,
        error: "rate limited",
      },
    ]);
  });
});
