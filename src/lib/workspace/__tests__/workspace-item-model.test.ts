import { describe, expect, it } from "vitest";
import type { Item } from "@/lib/workspace-state/types";
import {
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
        markdown: "# Hello

World",
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
      textContent: "# Hello

World",
      structuredData: null,
      assetData: null,
      embedData: null,
      sourceData: [{ title: "Ref", url: "https://example.com" }],
    });
    expect(split.extracted.searchText).toContain("hello");

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

  it("keeps flashcard and youtube content fully shared", () => {
    const flashcard: Item = {
      id: "flash-1",
      type: "flashcard",
      name: "Deck",
      subtitle: "",
      data: {
        cards: [{ id: "card-1", front: "Front", back: "Back" }],
      },
    };

    const youtube: Item = {
      id: "yt-1",
      type: "youtube",
      name: "Video",
      subtitle: "",
      data: {
        url: "https://youtube.com/watch?v=abc123",
        thumbnail: "https://img.youtube.com/vi/abc123/default.jpg",
      },
    };

    expect(buildWorkspaceItemTableRows({ workspaceId: "workspace-1", item: flashcard, sourceVersion: 1 }).content.structuredData).toEqual({
      cards: [{ id: "card-1", front: "Front", back: "Back" }],
    });
    expect(buildWorkspaceItemTableRows({ workspaceId: "workspace-1", item: youtube, sourceVersion: 1 }).content.embedData).toEqual({
      url: "https://youtube.com/watch?v=abc123",
      thumbnail: "https://img.youtube.com/vi/abc123/default.jpg",
    });
    expect(getWorkspaceItemCapabilities("flashcard")).toEqual(["structured_content"]);
    expect(getWorkspaceItemCapabilities("youtube")).toEqual(["embed_ref"]);
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
            },
          ],
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
      });

      expect(
        rehydrateWorkspaceItem({
          shell: rows.item,
          content: rows.content,
          extracted: rows.extracted,
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
});
