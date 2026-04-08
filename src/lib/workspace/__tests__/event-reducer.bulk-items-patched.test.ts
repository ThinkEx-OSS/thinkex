import { describe, expect, it } from "vitest";
import { eventReducer } from "../event-reducer";
import type { WorkspaceCanvasState, ImageData, Item, PdfData } from "@/lib/workspace-state/types";
import type { WorkspaceEvent } from "../events";

describe("eventReducer BULK_ITEMS_PATCHED", () => {
  it("deep merges OCR changes across multiple items in one event", () => {
    const state: WorkspaceCanvasState = {
      items: [
        {
          id: "pdf-1",
          type: "pdf",
          name: "Doc",
          subtitle: "",
          data: {
            fileUrl: "https://example.com/a.pdf",
            filename: "a.pdf",
            ocrStatus: "processing",
          },
        } as Item,
        {
          id: "img-1",
          type: "image",
          name: "Image",
          subtitle: "",
          data: {
            url: "https://example.com/b.png",
            altText: "Image",
            caption: "keep me",
            ocrStatus: "processing",
          },
        } as Item,
      ],
    };

    const event: WorkspaceEvent = {
      id: "evt-1",
      type: "BULK_ITEMS_PATCHED",
      timestamp: 123,
      userId: "user-1",
      payload: {
        updates: [
          {
            id: "pdf-1",
            changes: {
              data: ({
                ocrStatus: "complete",
                ocrPages: [{ index: 0, markdown: "pdf page" }],
              } satisfies Partial<PdfData>) as Item["data"],
            },
          },
          {
            id: "img-1",
            changes: {
              data: ({
                ocrStatus: "failed",
                ocrError: "bad image",
              } satisfies Partial<ImageData>) as Item["data"],
            },
          },
        ],
      },
    };

    const next = eventReducer(state, event);

    expect(next.items[0]?.data).toMatchObject({
      fileUrl: "https://example.com/a.pdf",
      filename: "a.pdf",
      ocrStatus: "complete",
      ocrPages: [{ index: 0, markdown: "pdf page" }],
    });

    expect(next.items[1]?.data).toMatchObject({
      url: "https://example.com/b.png",
      altText: "Image",
      caption: "keep me",
      ocrStatus: "failed",
      ocrError: "bad image",
    });
  });
});
