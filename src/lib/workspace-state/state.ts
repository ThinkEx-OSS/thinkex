import {
  Item,
  CardType,
  ItemData,
  PdfData,
  FlashcardData,
  FolderData,
  YouTubeData,
  QuizData,
  ImageData,
  AudioData,
  WebsiteData,
  DocumentData,
} from "@/lib/workspace-state/types";

export const initialItems: Item[] = [];

export function normalizeWorkspaceItems(value: unknown): Item[] {
  if (Array.isArray(value)) {
    return value as Item[];
  }

  if (value == null || typeof value !== "object") {
    return [...initialItems];
  }

  if (Array.isArray((value as { items?: unknown }).items)) {
    return ((value as { items: Item[] }).items ?? []) as Item[];
  }

  return [...initialItems];
}

export function defaultDataFor(type: CardType): ItemData {
  switch (type) {
    case "document":
      return { markdown: "" } as DocumentData;
    case "pdf":
      return { fileUrl: "", filename: "" } as PdfData;
    case "flashcard":
      return {
        cards: [],
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
    default: {
      const exhaustiveCheck: never = type;
      return exhaustiveCheck;
    }
  }
}
