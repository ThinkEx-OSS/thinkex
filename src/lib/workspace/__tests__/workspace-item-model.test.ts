import { describe, expect, it } from "vitest";
import type { Item } from "@/lib/workspace-state/types";
import {
  WORKSPACE_ITEM_PRIMARY_USER_STATE_KEY,
  buildWorkspaceItemTableRows,
  getWorkspaceItemCapabilities,
  normalizeItemData,
  rehydrateWorkspaceItem,
  splitWorkspaceItem,
} from "../workspace-item-model";

describe("workspace item model", () => {
  it("round-trips document content and source metadata through table slices", () => {
    const item: Item = {
      id: "doc-1",
      type: "document",
      name: "Doc",
      subtitle: "Research notes",
      data: {
        markdown: "# Hello\n\nWorld",
        sources: [{ title: "Ref", url: "https://example.com" }],
      },
      lastModified: 123,
    };

    const split = splitWorkspaceItem(item);

    expect(split.shell).toMatchObject({
      itemId: "doc-1",
      type: "document",
      name: "Doc",
      subtitle: "Research notes",
      sourceCount: 1,
      hasOcr: false,
      hasTranscript: false,
    });
    expect(split.content).toEqual({
      textContent: "# Hello\n\nWorld",
      structuredData: null,
      assetData: null,
      embedData: null,
      sourceData: [{ title: "Ref", url: "https://example.com" }],
    });
    expect(split.extracted.searchText).toContain("hello");
    expect(split.userStates).toEqual([]);

    expect(
      rehydrateWorkspaceItem({
        shell: split.shell,
        content: split.content,
        extracted: split.extracted,
      }),
    ).toEqual(item);
  });

  it("routes OCR fields into shell, content, and extracted ownership for pdf items", () => {
    const item: Item = {
      id: "pdf-1",
      type: "pdf",
      name: "PDF",
      subtitle: "",
      data: {
        fileUrl: "https://example.com/a.pdf",
        filename: "a.pdf",
        fileSize: 1024,
        ocrStatus: "failed",
        ocrError: "too blurry",
        ocrPages: [{ index: 0, markdown: "Page body" }],
      },
    };

    const rows = buildWorkspaceItemTableRows({
      workspaceId: "workspace-1",
      item,
      sourceVersion: 7,
    });

    expect(rows.item).toMatchObject({
      workspaceId: "workspace-1",
      sourceVersion: 7,
      itemId: "pdf-1",
      ocrStatus: "failed",
      hasOcr: true,
      ocrPageCount: 1,
    });
    expect(rows.content.assetData).toEqual({
      fileUrl: "https://example.com/a.pdf",
      filename: "a.pdf",
      fileSize: 1024,
      ocrError: "too blurry",
    });
    expect(rows.extracted).toMatchObject({
      workspaceId: "workspace-1",
      itemId: "pdf-1",
      ocrText: "Page body",
      ocrPages: [{ index: 0, markdown: "Page body" }],
    });

    expect(
      rehydrateWorkspaceItem({
        shell: rows.item,
        content: rows.content,
        extracted: rows.extracted,
      }),
    ).toEqual(item);
  });

  it("separates flashcard user state from shared structured content", () => {
    const item: Item = {
      id: "flash-1",
      type: "flashcard",
      name: "Deck",
      subtitle: "",
      data: {
        cards: [{ id: "card-1", front: "Front", back: "Back" }],
        currentIndex: 2,
      },
    };

    const rows = buildWorkspaceItemTableRows({
      workspaceId: "workspace-1",
      item,
      sourceVersion: 3,
      userId: "user-1",
    });

    expect(rows.content.structuredData).toEqual({
      cards: [{ id: "card-1", front: "Front", back: "Back" }],
    });
    expect(rows.item.contentHash).toBeTruthy();
    expect(rows.userStates).toEqual([
      {
        workspaceId: "workspace-1",
        itemId: "flash-1",
        userId: "user-1",
        stateKey: WORKSPACE_ITEM_PRIMARY_USER_STATE_KEY,
        stateType: "flashcard",
        stateSchemaVersion: 1,
        state: { currentIndex: 2 },
      },
    ]);

    const rehydrated = rehydrateWorkspaceItem({
      shell: rows.item,
      content: rows.content,
      extracted: rows.extracted,
      userStates: rows.userStates,
    });

    expect(rehydrated).toEqual(item);
    expect(getWorkspaceItemCapabilities("flashcard")).toContain("user_state");
  });

  it("routes audio transcript/search data into extracted state and preserves shared processing metadata", () => {
    const item: Item = {
      id: "audio-1",
      type: "audio",
      name: "Recording",
      subtitle: "",
      data: {
        fileUrl: "https://example.com/audio.mp3",
        filename: "audio.mp3",
        duration: 42,
        mimeType: "audio/mpeg",
        summary: "Lecture summary",
        transcript: "Hello world transcript",
        segments: [
          {
            speaker: "Speaker 1",
            timestamp: "00:00",
            content: "Hello world transcript",
          },
        ],
        processingStatus: "complete",
      },
    };

    const split = splitWorkspaceItem(item);

    expect(split.shell).toMatchObject({
      processingStatus: "complete",
      hasTranscript: true,
      hasOcr: false,
    });
    expect(split.content.assetData).toEqual({
      fileUrl: "https://example.com/audio.mp3",
      filename: "audio.mp3",
      duration: 42,
      mimeType: "audio/mpeg",
    });
    expect(split.content.structuredData).toEqual({
      summary: "Lecture summary",
    });
    expect(split.extracted.transcriptText).toBe("Hello world transcript");
    expect(split.extracted.transcriptSegments).toEqual([
      {
        speaker: "Speaker 1",
        timestamp: "00:00",
        content: "Hello world transcript",
      },
    ]);
    expect(split.extracted.searchText).toContain("lecture summary");
    expect(split.userStates).toEqual([]);

    expect(
      rehydrateWorkspaceItem({
        shell: split.shell,
        content: split.content,
        extracted: split.extracted,
      }),
    ).toEqual(item);
  });

  it("keeps youtube playback state in user-state rows instead of shared content", () => {
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

    const rows = buildWorkspaceItemTableRows({
      workspaceId: "workspace-1",
      item,
      sourceVersion: 9,
      userId: "user-1",
    });

    expect(rows.content.embedData).toEqual({
      url: "https://youtube.com/watch?v=abc123",
      thumbnail: "https://img.youtube.com/vi/abc123/default.jpg",
    });
    expect(rows.userStates).toEqual([
      {
        workspaceId: "workspace-1",
        itemId: "yt-1",
        userId: "user-1",
        stateKey: WORKSPACE_ITEM_PRIMARY_USER_STATE_KEY,
        stateType: "youtube",
        stateSchemaVersion: 1,
        state: { progress: 42, playbackRate: 1.5 },
      },
    ]);

    expect(
      rehydrateWorkspaceItem({
        shell: rows.item,
        content: rows.content,
        extracted: rows.extracted,
        userStates: rows.userStates,
      }),
    ).toEqual(item);
  });

  it("round-trips the remaining item types through split and rehydrate", () => {
    const cases: Item[] = [
      {
        id: "quiz-1",
        type: "quiz",
        name: "Quiz",
        subtitle: "",
        data: {
          title: "Pop Quiz",
          questions: [
            {
              id: "q-1",
              type: "multiple_choice",
              questionText: "Question?",
              options: ["A", "B", "C", "D"],
              correctIndex: 0,
              explanation: "Because",
            },
          ],
          session: {
            currentIndex: 0,
            answeredQuestions: [
              { questionId: "q-1", userAnswer: 0, isCorrect: true },
            ],
          },
        },
      },
      {
        id: "image-1",
        type: "image",
        name: "Image",
        subtitle: "",
        data: {
          url: "https://example.com/image.png",
          altText: "Diagram",
          caption: "Figure 1",
          ocrStatus: "complete",
          ocrPages: [{ index: 0, markdown: "Caption text" }],
        },
      },
      {
        id: "website-1",
        type: "website",
        name: "Website",
        subtitle: "",
        data: {
          url: "https://example.com",
          favicon: "https://example.com/favicon.ico",
        },
      },
      {
        id: "folder-1",
        type: "folder",
        name: "Folder",
        subtitle: "",
        data: {},
      },
    ];

    for (const item of cases) {
      const rows = buildWorkspaceItemTableRows({
        workspaceId: "workspace-1",
        item,
        sourceVersion: 4,
        userId: item.type === "quiz" ? "user-1" : undefined,
      });

      expect(
        rehydrateWorkspaceItem({
          shell: rows.item,
          content: rows.content,
          extracted: rows.extracted,
          userStates: rows.userStates,
        }),
      ).toEqual(item);
    }
  });

  it("preserves valid item fields when normalization encounters malformed optional data", () => {
    expect(
      normalizeItemData("audio", {
        fileUrl: "https://example.com/audio.mp3",
        filename: "audio.mp3",
        processingStatus: "complete",
        segments: "not-an-array",
      }),
    ).toMatchObject({
      fileUrl: "https://example.com/audio.mp3",
      filename: "audio.mp3",
      processingStatus: "complete",
      segments: "not-an-array",
    });
  });

  it("throws when user-scoped state exists but userId is omitted", () => {
    expect(() =>
      buildWorkspaceItemTableRows({
        workspaceId: "workspace-1",
        item: {
          id: "flash-2",
          type: "flashcard",
          name: "Deck",
          subtitle: "",
          data: {
            cards: [{ id: "card-1", front: "Front", back: "Back" }],
            currentIndex: 1,
          },
        },
        sourceVersion: 2,
      }),
    ).toThrow("userId is required for items with user state");
  });
});
