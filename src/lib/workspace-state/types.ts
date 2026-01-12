import type { CardColor } from './colors';

export type CardType = "note" | "pdf" | "flashcard" | "folder" | "youtube";

export interface NoteData {
  field1?: string; // textarea - legacy plain text format
  blockContent?: unknown; // BlockNote JSON blocks - new rich-text format
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
}

export type ItemData = NoteData | PdfData | FlashcardData | FolderData | YouTubeData;

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

export type WorkspaceTemplate = "blank" | "project_management" | "knowledge_base" | "team_planning";

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
