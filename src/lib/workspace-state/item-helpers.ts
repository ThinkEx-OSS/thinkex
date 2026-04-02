import type { CardType, ItemData, PdfData, FlashcardData, FolderData, YouTubeData, QuizData, ImageData, AudioData, WebsiteData, DocumentData } from "./types";

/**
 * Generate a unique item ID
 */
export function generateItemId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function defaultDataFor(type: CardType): ItemData {
  switch (type) {
    case "pdf":
      return { fileUrl: "", filename: "" } as PdfData;
    case "flashcard":
      return {
        cards: [
          {
            id: generateItemId(),
            front: "",
            back: "",
            frontBlocks: [],
            backBlocks: []
          }
        ],
        currentIndex: 0
      } as FlashcardData;
    case "folder":
      return {} as FolderData;
    case "youtube":
      return { url: "" } as YouTubeData;
    case "image":
      return { url: "" } as ImageData;
    case "audio":
      return { fileUrl: "", filename: "", processingStatus: "uploading" } as AudioData;
    case "quiz":
      return { questions: [] } as QuizData;
    case "website":
      return { url: "" } as WebsiteData;
    case "document":
      return { markdown: "" } as DocumentData;
    default: {
      const exhaustiveCheck: never = type;
      return exhaustiveCheck;
    }
  }
}

