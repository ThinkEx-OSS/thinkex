import { z } from "zod";
import type { CardColor } from "./colors";
import {
  sourceSchema,
  pdfDataSchema,
  flashcardItemSchema,
  flashcardDataSchema,
  youtubeDataSchema,
  imageDataSchema,
  quizQuestionSchema,
  quizDataSchema,
  audioSegmentSchema,
  audioDataSchema,
  documentDataSchema,
  folderDataSchema,
} from "./item-data-schemas";

export type CardType =
  | "pdf"
  | "flashcard"
  | "folder"
  | "youtube"
  | "quiz"
  | "image"
  | "audio"
  | "document";

export type Source = z.infer<typeof sourceSchema>;
export type PdfData = z.infer<typeof pdfDataSchema>;
export type FlashcardItem = z.infer<typeof flashcardItemSchema>;
export type FlashcardData = z.infer<typeof flashcardDataSchema>;
export type FolderData = z.infer<typeof folderDataSchema>;
export type YouTubeData = z.infer<typeof youtubeDataSchema>;
export type ImageData = z.infer<typeof imageDataSchema>;
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type QuizData = z.infer<typeof quizDataSchema>;
export type AudioSegment = z.infer<typeof audioSegmentSchema>;
export type AudioData = z.infer<typeof audioDataSchema>;
export type DocumentData = z.infer<typeof documentDataSchema>;

export type ItemData =
  | PdfData
  | FlashcardData
  | FolderData
  | YouTubeData
  | QuizData
  | ImageData
  | AudioData
  | DocumentData;

export interface LayoutPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ResponsiveLayouts {
  lg?: LayoutPosition;
}

export interface Item {
  id: string;
  type: CardType;
  name: string;
  subtitle: string;
  data: ItemData;
  color?: CardColor;
  folderId?: string;
  sortOrder?: number | null;
  layout?: ResponsiveLayouts | LayoutPosition;
  lastModified?: number;
}

export type WorkspaceTemplate = "blank" | "getting_started";

export type PermissionLevel = "viewer" | "editor" | "admin";

export type {
  Workspace,
  WorkspaceWithState,
  UserProfile,
} from "@/lib/db/types";

export interface TemplateDefinition {
  name: string;
  description: string;
  template: WorkspaceTemplate;
  initialItems: Item[];
}
