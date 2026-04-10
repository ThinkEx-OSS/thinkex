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
  quizSessionSchema,
  quizDataSchema,
  audioSegmentSchema,
  audioDataSchema,
  websiteDataSchema,
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
  | "website"
  | "document";

export type Source = z.infer<typeof sourceSchema>;
export type PdfData = z.infer<typeof pdfDataSchema>;
export type FlashcardItem = z.infer<typeof flashcardItemSchema>;
export type FlashcardData = z.infer<typeof flashcardDataSchema>;
export type FolderData = z.infer<typeof folderDataSchema>;
export type YouTubeData = z.infer<typeof youtubeDataSchema>;
export type ImageData = z.infer<typeof imageDataSchema>;
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type QuizSessionData = z.infer<typeof quizSessionSchema>;
export type QuizData = z.infer<typeof quizDataSchema>;
export type AudioSegment = z.infer<typeof audioSegmentSchema>;
export type AudioData = z.infer<typeof audioDataSchema>;
export type WebsiteData = z.infer<typeof websiteDataSchema>;
export type DocumentData = z.infer<typeof documentDataSchema>;

export type ItemData =
  | PdfData
  | FlashcardData
  | FolderData
  | YouTubeData
  | QuizData
  | ImageData
  | AudioData
  | WebsiteData
  | DocumentData;

/** Layout position for a single breakpoint */
export interface LayoutPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Responsive layouts for different breakpoints */
export interface ResponsiveLayouts {
  lg?: LayoutPosition; // 4-column layout
}

export interface Item {
  id: string;
  type: CardType;
  name: string; // editable title
  subtitle: string; // subtitle shown under the title
  data: ItemData;
  color?: CardColor; // background color for the card
  folderId?: string; // Single folder assignment (flat structure)
  /**
   * Layout position for the workspace grid.
   * May be responsive (`ResponsiveLayouts`) or a flat `LayoutPosition` (treated as `lg`).
   */
  layout?: ResponsiveLayouts | LayoutPosition;
  /** Timestamp (ms) when item was last modified. Set by event reducer. Used for AI conflict detection. */
  lastModified?: number;
}

// =====================================================
// WORKSPACE TYPES
// =====================================================

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
