import type { CardType, ItemData, NoteData, PdfData, FlashcardData, FolderData, YouTubeData, ImageData } from "./types";

/**
 * Generate a unique item ID
 */
export function generateItemId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function defaultDataFor(type: CardType): ItemData {
  switch (type) {
    case "note":
      return { field1: "" } as NoteData;
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
    default:
      return { field1: "" } as NoteData;
  }
}

