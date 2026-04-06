import type { CardColor } from "./colors";

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

/**
 * Source attribution for documents created from web search.
 */
export interface Source {
  title: string; // Title of the source page
  url: string; // URL of the source
  favicon?: string; // Optional favicon URL
}

export interface PdfData {
  fileUrl: string; // Supabase storage URL
  filename: string; // stored filename/path
  fileSize?: number; // optional file size in bytes
  ocrStatus?: "complete" | "failed" | "processing";
  ocrError?: string;
  ocrPages?: Array<{
    index: number;
    markdown: string;
    footer?: string | null;
    header?: string | null;
    hyperlinks?: unknown[];
    tables?: unknown[];
  }>;
}

export interface FlashcardItem {
  id: string;
  /** Markdown (same role as document body). */
  front: string;
  back: string;
}

export interface FlashcardData {
  cards: FlashcardItem[];
  currentIndex?: number; // Optional persistence
}

export type FolderData = Record<string, never>;

export interface YouTubeData {
  url: string; // YouTube video URL
  thumbnail?: string; // Optional thumbnail URL from oEmbed API
  progress?: number; // Where user left off (seconds)
  /** Playback speed (e.g. 1, 1.25, 1.5). Persisted when opening/closing the audio item panel. */
  playbackRate?: number;
}

export interface ImageData {
  url: string; // The source URL of the image
  altText?: string; // Optional accessibility text
  caption?: string; // Optional caption
  ocrStatus?: "complete" | "failed" | "processing";
  ocrError?: string;
  ocrPages?: Array<{
    index: number;
    markdown: string;
    footer?: string | null;
    header?: string | null;
    hyperlinks?: unknown[];
    tables?: unknown[];
  }>;
}

// Quiz Types
export type QuestionType = "multiple_choice" | "true_false";

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  questionText: string;
  options: string[]; // Answer options (4 for MC, 2 for T/F)
  correctIndex: number; // Index of correct answer in options array
  hint?: string; // Optional hint text
  explanation: string; // Explanation shown after answering
  sourceContext?: string; // Optional: excerpt from source material
}

export interface QuizSessionData {
  currentIndex: number;
  answeredQuestions: {
    questionId: string;
    userAnswer: number; // Index selected by user
    isCorrect: boolean;
  }[];
  startedAt?: number; // Timestamp when quiz was started
  completedAt?: number; // Timestamp when quiz was completed
}

export interface QuizData {
  title?: string;
  questions: QuizQuestion[];
  session?: QuizSessionData; // Session state for resuming
}

// Audio Types
export interface AudioSegment {
  speaker: string;
  timestamp: string;
  content: string;
  language?: string;
  language_code?: string;
  translation?: string;
  emotion?: "happy" | "sad" | "angry" | "neutral";
}

export interface AudioData {
  fileUrl: string; // Supabase/local storage URL
  filename: string; // Original filename
  fileSize?: number; // File size in bytes
  duration?: number; // Duration in seconds
  mimeType?: string; // MIME type of the audio file
  summary?: string; // Gemini-generated summary
  transcript?: string; // Full plain-text transcript
  segments?: AudioSegment[]; // Timestamped speaker segments
  processingStatus: "uploading" | "processing" | "complete" | "failed";
  error?: string; // Error message if processing failed
}

export interface WebsiteData {
  url: string; // The website URL to embed
  favicon?: string; // Favicon URL (e.g. from Google's favicon API)
}

export interface DocumentData {
  markdown?: string;
  sources?: Source[];
}

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

export interface AgentState {
  items: Item[]; // Includes folder-type items (type: 'folder')
  globalTitle: string;
  lastAction?: string;
  workspaceId?: string; // Supabase workspace ID for persistence
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
  initialState: Partial<AgentState>;
}
