import { describe, expect, it } from "vitest";
import type { Item, QuizData } from "@/lib/workspace-state/types";
import {
  buildWorkspaceItemProjection,
  diffItemDataPatch,
  getItemSearchBody,
  rehydrateItemData,
} from "../workspace-item-model";

describe("workspace item model", () => {
  it("splits and rehydrates document markdown", () => {
    const item: Item = {
      id: "doc-1",
      type: "document",
      name: "Doc",
      subtitle: "",
      data: {
        markdown: "# Hello\n\nWorld",
        sources: [{ title: "Ref", url: "https://example.com" }],
      },
    };

    const projection = buildWorkspaceItemProjection(item);

    expect(projection.data).toEqual({
      sources: [{ title: "Ref", url: "https://example.com" }],
    });
    expect(projection.content.textContent).toBe("# Hello\n\nWorld");
    expect(projection.extracted.searchText).toContain("hello");

    const rehydrated = rehydrateItemData(
      "document",
      projection.data,
      projection.content,
      projection.extracted,
    );

    expect(rehydrated).toEqual(item.data);
  });

  it("moves OCR pages into extracted projection data", () => {
    const item: Item = {
      id: "pdf-1",
      type: "pdf",
      name: "PDF",
      subtitle: "",
      data: {
        fileUrl: "https://example.com/a.pdf",
        filename: "a.pdf",
        ocrStatus: "complete",
        ocrPages: [{ index: 0, markdown: "Page body" }],
      },
    };

    const projection = buildWorkspaceItemProjection(item);

    expect(projection.data).toEqual({
      fileUrl: "https://example.com/a.pdf",
      filename: "a.pdf",
      ocrStatus: "complete",
    });
    expect(projection.extracted.ocrPages).toEqual([
      { index: 0, markdown: "Page body" },
    ]);
    expect(projection.ocrPageCount).toBe(1);

    const rehydrated = rehydrateItemData(
      "pdf",
      projection.data,
      projection.content,
      projection.extracted,
    );
    expect(rehydrated).toEqual(item.data);
  });

  it("builds minimal top-level patches when data changes", () => {
    const previous = {
      markdown: "old",
      sources: [{ title: "A", url: "https://a.test" }],
    };
    const next = {
      markdown: "new",
      sources: [{ title: "A", url: "https://a.test" }],
    };

    expect(diffItemDataPatch(previous as Item["data"], next as Item["data"])).toEqual({
      markdown: "new",
    });
  });

  it("extracts unified search content across item types", () => {
    const flashcard: Item = {
      id: "fc-1",
      type: "flashcard",
      name: "Deck",
      subtitle: "",
      data: {
        cards: [{ id: "c-1", front: "Front", back: "Back" }],
      },
    };

    expect(getItemSearchBody(flashcard)).toContain("Front");
    expect(getItemSearchBody(flashcard)).toContain("Back");
  });

  it("preserves legacy item payloads for unknown item types", () => {
    const item = {
      id: "legacy-1",
      type: "note",
      name: "Legacy note",
      subtitle: "",
      data: {
        markdown: "hello",
        blocks: [{ id: "b1", text: "hello" }],
      },
    } as unknown as Item;

    const projection = buildWorkspaceItemProjection(item);

    expect(projection.data).toEqual(item.data);
    expect(rehydrateItemData(item.type, projection.data, projection.content, projection.extracted)).toEqual(
      item.data,
    );
  });

  it("keeps quiz session out of shared projection data and restores it from user state", () => {
    const item: Item = {
      id: "quiz-1",
      type: "quiz",
      name: "Quiz",
      subtitle: "",
      data: {
        title: "Quiz title",
        questions: [
          {
            id: "q-1",
            type: "multiple_choice",
            questionText: "Question?",
            options: ["A", "B"],
            correctIndex: 0,
            explanation: "Because",
          },
        ],
        session: {
          currentIndex: 0,
          answeredQuestions: [
            { questionId: "q-1", userAnswer: 0, isCorrect: true },
          ],
          startedAt: 123,
        },
      },
    };

    const projection = buildWorkspaceItemProjection(item);

    expect(projection.data).toEqual({
      title: "Quiz title",
    });
    expect(projection.userState).toEqual({
      type: "quiz",
      session: (item.data as QuizData).session,
    });

    expect(
      rehydrateItemData(
        "quiz",
        projection.data,
        projection.content,
        projection.extracted,
      ),
    ).toEqual({
      title: "Quiz title",
      questions: (item.data as QuizData).questions,
    });

    expect(
      rehydrateItemData(
        "quiz",
        projection.data,
        projection.content,
        projection.extracted,
        projection.userState,
      ),
    ).toEqual(item.data);
  });

  it("keeps youtube progress out of shared projection data and restores it from user state", () => {
    const item: Item = {
      id: "yt-1",
      type: "youtube",
      name: "Video",
      subtitle: "",
      data: {
        url: "https://youtube.com/watch?v=abc123",
        thumbnail: "https://img.youtube.com/vi/abc123/default.jpg",
        progress: 42,
        playbackRate: 1.5,
      },
    };

    const projection = buildWorkspaceItemProjection(item);

    expect(projection.data).toEqual({
      url: "https://youtube.com/watch?v=abc123",
      thumbnail: "https://img.youtube.com/vi/abc123/default.jpg",
    });
    expect(projection.userState).toEqual({
      type: "youtube",
      progress: 42,
      playbackRate: 1.5,
    });

    expect(
      rehydrateItemData(
        "youtube",
        projection.data,
        projection.content,
        projection.extracted,
      ),
    ).toEqual({
      url: "https://youtube.com/watch?v=abc123",
      thumbnail: "https://img.youtube.com/vi/abc123/default.jpg",
    });

    expect(
      rehydrateItemData(
        "youtube",
        projection.data,
        projection.content,
        projection.extracted,
        projection.userState,
      ),
    ).toEqual(item.data);
  });
});
