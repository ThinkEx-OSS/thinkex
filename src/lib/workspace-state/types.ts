import type { CardColor } from './colors';

export type CardType = "note" | "pdf" | "flashcard" | "folder" | "youtube" | "quiz" | "image";

/**
 * Source attribution for notes created from web search or deep research
 */
export interface Source {
  title: string;  // Title of the source page
  url: string;    // URL of the source
  favicon?: string; // Optional favicon URL
}

export interface NoteData {
  field1?: string; // textarea - legacy plain text format
  blockContent?: unknown; // BlockNote JSON blocks - new rich-text format
  // Optional: Sources from web search or deep research
  sources?: Source[];
  // Optional: Deep Research metadata (when this note is a research result)
  deepResearch?: {
    prompt: string;           // Original research prompt
    interactionId: string;    // Google Deep Research interaction ID
    status: "researching" | "complete" | "failed";
    thoughts: string[];       // Streaming thought summaries
    error?: string;           // Error message if failed
  };
}

export interface PdfData {
  fileUrl: string; // Supabase storage URL
  filename: string; // original filename
  fileSize?: number; // optional file size in bytes
}

export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
  frontBlocks?: unknown; // BlockNote JSON blocks
  backBlocks?: unknown; // BlockNote JSON blocks
}

export interface FlashcardData {
  cards: FlashcardItem[];
  currentIndex?: number; // Optional persistence
  // Legacy fields kept for backward compatibility during migration
  front?: string;
  back?: string;
  frontBlocks?: unknown;
  backBlocks?: unknown;
}

export interface FolderData {
  // Folder-specific data (currently empty, but available for future extensions)
}

export interface YouTubeData {
  url: string; // YouTube video URL
  thumbnail?: string; // Optional thumbnail URL from oEmbed API
}

export interface ImageData {
  url: string;      // The source URL of the image
  altText?: string; // Optional accessibility text
  caption?: string; // Optional caption
}

// Quiz Types
export type QuestionType = "multiple_choice" | "true_false";

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  questionText: string;
  options: string[];      // Answer options (4 for MC, 2 for T/F)
  correctIndex: number;   // Index of correct answer in options array
  hint?: string;          // Optional hint text
  explanation: string;    // Explanation shown after answering
  sourceContext?: string; // Optional: excerpt from source material
}

export interface QuizSessionData {
  currentIndex: number;
  answeredQuestions: {
    questionId: string;
    userAnswer: number;   // Index selected by user
    isCorrect: boolean;
  }[];
  startedAt?: number;     // Timestamp when quiz was started
  completedAt?: number;   // Timestamp when quiz was completed
}

export interface QuizData {
  title?: string;
  difficulty?: "easy" | "medium" | "hard";
  sourceCardIds?: string[];     // IDs of cards used to generate (if context-based)
  sourceCardNames?: string[];   // Names for display
  questions: QuizQuestion[];
  session?: QuizSessionData;    // Session state for resuming
}

export type ItemData = NoteData | PdfData | FlashcardData | FolderData | YouTubeData | QuizData | ImageData;

// =====================================================
// FOLDER TYPES (DEPRECATED)
// =====================================================

/**
 * @deprecated Folders are now represented as Item with type: 'folder'.
 * This interface is kept for backward compatibility with old event data.
 * Use Item with type: 'folder' instead.
 */
export interface Folder {
  id: string;
  name: string;
  color?: CardColor; // Optional folder color
  createdAt: number; // Timestamp
  layout?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

/** Layout position for a single breakpoint */
export interface LayoutPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Responsive layouts for different breakpoints */
export interface ResponsiveLayouts {
  lg?: LayoutPosition;  // 4-column layout
  xxs?: LayoutPosition; // 1-column layout
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
   * Responsive layout positions for different breakpoints.
   * For backwards compatibility, this can also be a flat LayoutPosition object
   * (old format), which will be treated as the 'lg' layout.
   */
  layout?: ResponsiveLayouts | LayoutPosition;
  lastSource?: 'user' | 'agent';
}

export interface AgentState {
  items: Item[]; // Includes folder-type items (type: 'folder')
  globalTitle: string;
  globalDescription: string;
  lastAction?: string;
  itemsCreated: number;
  workspaceId?: string; // Supabase workspace ID for persistence
  /** @deprecated Folders are now items with type: 'folder'. This field is kept for backward compatibility but is not used. */
  folders?: Folder[];
}

// =====================================================
// WORKSPACE TYPES
// =====================================================

export type WorkspaceTemplate = "blank" | "getting_started" | "project_management" | "knowledge_base" | "team_planning";

export type PermissionLevel = "viewer" | "editor" | "admin";

// Re-export Drizzle types for backward compatibility
export type {
  Workspace,
  WorkspaceWithState,
  UserProfile
} from '@/lib/db/types';

// Legacy interface for backward compatibility (DEPRECATED - use Drizzle types instead)
/** @deprecated Use Workspace from @/lib/db/types instead */
export interface LegacyWorkspace {
  id: string;
  userId: string; // Better Auth user ID (camelCase)
  name: string;
  slug: string; // URL-friendly slug (e.g., "my-awesome-project")
  description: string;
  template: WorkspaceTemplate;
  isPublic: boolean; // camelCase
  icon?: string | null; // Hero Icon component name (e.g., "FolderIcon")
  color?: CardColor | null; // Hex color value from CardColor type (e.g., "#3B82F6")
  sortOrder?: number; // Custom sort order for user workspaces (camelCase)
  createdAt: string; // camelCase
  updatedAt: string; // camelCase
}

export interface TemplateDefinition {
  name: string;
  description: string;
  template: WorkspaceTemplate;
  initialState: Partial<AgentState>;
}
