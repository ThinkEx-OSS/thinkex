import { describe, expect, it } from "vitest";
import { eventReducer } from "../event-reducer";
import type { Item, PdfData, ImageData } from "@/lib/workspace-state/types";
import type { WorkspaceEvent } from "../events";

describe("eventReducer lightweight OCR events", () => {
  const basePdf: Item = {
    id: "pdf-1",
    type: "pdf",
    name: "Doc",
    subtitle: "",
    data: {
      fileUrl: "https://example.com/a.pdf",
      filename: "a.pdf",
      ocrStatus: "processing",
    } as PdfData,
  };

  const baseImage: Item = {
    id: "img-1",
    type: "image",
    name: "Image",
    subtitle: "",
    data: {
      url: "https://example.com/b.png",
      ocrStatus: "processing",
    } as ImageData,
  };

  it("applies status-only BULK_ITEMS_PATCHED (no ocrPages in event)", () => {
    const event: WorkspaceEvent = {
      id: "evt-1",
      type: "BULK_ITEMS_PATCHED",
      timestamp: Date.now(),
      userId: "user-1",
      payload: {
        updates: [
          {
            id: "pdf-1",
            changes: {
              data: { ocrStatus: "complete" } as Item["data"],
            },
          },
          {
            id: "img-1",
            changes: {
              data: {
                ocrStatus: "failed",
                ocrError: "bad image",
              } as Item["data"],
            },
          },
        ],
      },
    };

    const next = eventReducer([basePdf, baseImage], event);

    const pdfData = next[0].data as PdfData;
    expect(pdfData.ocrStatus).toBe("complete");
    expect(pdfData.fileUrl).toBe("https://example.com/a.pdf");
    expect(pdfData.filename).toBe("a.pdf");

    const imgData = next[1].data as ImageData;
    expect(imgData.ocrStatus).toBe("failed");
    expect(imgData.ocrError).toBe("bad image");
    expect(imgData.url).toBe("https://example.com/b.png");
  });

  it("applies status-only ITEM_UPDATED for audio completion", () => {
    const audioItem: Item = {
      id: "audio-1",
      type: "audio",
      name: "Recording",
      subtitle: "",
      data: {
        fileUrl: "https://example.com/a.mp3",
        filename: "a.mp3",
        processingStatus: "processing",
      },
    };

    const event: WorkspaceEvent = {
      id: "evt-2",
      type: "ITEM_UPDATED",
      timestamp: Date.now(),
      userId: "user-1",
      payload: {
        id: "audio-1",
        changes: {
          data: {
            summary: "Meeting notes",
            processingStatus: "complete",
          } as Item["data"],
        },
      },
    };

    const next = eventReducer([audioItem], event);
    const data = next[0].data as Record<string, unknown>;
    expect(data.processingStatus).toBe("complete");
    expect(data.summary).toBe("Meeting notes");
    expect(data.fileUrl).toBe("https://example.com/a.mp3");
  });
});
