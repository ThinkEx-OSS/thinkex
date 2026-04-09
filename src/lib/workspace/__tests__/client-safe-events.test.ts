import { describe, expect, it } from "vitest";
import type { WorkspaceEvent } from "@/lib/workspace/events";
import { sanitizeWorkspaceEventForClient } from "@/lib/workspace/client-safe-events";

describe("client-safe-events", () => {
  it("strips per-user fields and heavy OCR payloads without mutating the original event", () => {
    const event: WorkspaceEvent = {
      id: "evt-1",
      type: "BULK_ITEMS_CREATED",
      payload: {
        items: [
          {
            id: "flash-1",
            type: "flashcard",
            name: "Deck",
            subtitle: "",
            data: {
              cards: [{ id: "c1", front: "Q", back: "A" }],
              currentIndex: 3,
            },
          },
          {
            id: "quiz-1",
            type: "quiz",
            name: "Quiz",
            subtitle: "",
            data: {
              questions: [],
              session: { currentIndex: 2, answeredQuestions: [] },
            },
          },
          {
            id: "yt-1",
            type: "youtube",
            name: "Video",
            subtitle: "",
            data: {
              url: "https://youtu.be/1",
              progress: 88,
              playbackRate: 1.5,
            },
          },
          {
            id: "pdf-1",
            type: "pdf",
            name: "PDF",
            subtitle: "",
            data: {
              fileUrl: "https://cdn.example.com/doc.pdf",
              filename: "doc.pdf",
              ocrPages: [{ index: 0, markdown: "page" }],
            },
          },
        ],
      },
      timestamp: 1,
      userId: "user-1",
      version: 10,
    };

    const sanitized = sanitizeWorkspaceEventForClient(event);
    const items = (
      sanitized.payload as { items: Array<{ data: Record<string, unknown> }> }
    ).items;

    expect(items[0].data.currentIndex).toBeUndefined();
    expect(items[1].data.session).toBeUndefined();
    expect(items[2].data.progress).toBeUndefined();
    expect(items[2].data.playbackRate).toBeUndefined();
    expect(items[3].data.ocrPages).toBeUndefined();

    const originalItems = (
      event.payload as { items: Array<{ data: Record<string, unknown> }> }
    ).items;
    expect(originalItems[0].data.currentIndex).toBe(3);
    expect(originalItems[1].data.session).toEqual({
      currentIndex: 2,
      answeredQuestions: [],
    });
    expect(originalItems[2].data.progress).toBe(88);
    expect(originalItems[2].data.playbackRate).toBe(1.5);
    expect(originalItems[3].data.ocrPages).toEqual([
      { index: 0, markdown: "page" },
    ]);
  });
});
