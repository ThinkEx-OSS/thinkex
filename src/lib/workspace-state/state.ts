import {
  WorkspaceCanvasState,
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

export const initialState: WorkspaceCanvasState = {
  items: [],
};

export function normalizeWorkspaceCanvasState(
  value: unknown,
): WorkspaceCanvasState {
  if (value == null || typeof value !== "object") {
    return { ...initialState };
  }

  const items = Array.isArray((value as { items?: unknown }).items)
    ? ((value as { items: WorkspaceCanvasState["items"] }).items ?? [])
    : [];

  return { items };
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
        currentIndex: 0,
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
