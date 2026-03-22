import {
  AgentState,
  CardType,
  ItemData,
  NoteData,
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



export const initialState: AgentState = {
  items: [],
  globalTitle: "",
  lastAction: "",

};

export function isNonEmptyAgentState(value: unknown): value is AgentState {
  if (value == null || typeof value !== "object") return false;
  const keys = Object.keys(value as Record<string, unknown>);
  return keys.length > 0;
}

export function defaultDataFor(type: CardType): ItemData {
  switch (type) {
    case "note":
      return { field1: "" } as NoteData;
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


