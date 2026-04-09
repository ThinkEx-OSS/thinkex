import type { CardColor } from "@/lib/workspace-state/colors";
import type {
  AudioSegment,
  CardType,
  ImageData,
  LayoutPosition,
  PdfData,
  ResponsiveLayouts,
  Source,
} from "@/lib/workspace-state/types";

export const WORKSPACE_ITEM_DATA_SCHEMA_VERSION = 1;
export const WORKSPACE_ITEM_USER_STATE_SCHEMA_VERSION = 1;
export const WORKSPACE_ITEM_PRIMARY_USER_STATE_KEY = "item";

export type WorkspaceItemCapability =
  | "asset_ref"
  | "embed_ref"
  | "ocr_content"
  | "sources"
  | "structured_content"
  | "text_content"
  | "transcript_content"
  | "user_state";

export interface WorkspaceItemShellProjection {
  itemId: string;
  type: CardType;
  name: string;
  subtitle: string;
  color: CardColor | null;
  folderId: string | null;
  layout: ResponsiveLayouts | LayoutPosition | null;
  lastModified: number | null;
  dataSchemaVersion: number;
  contentHash: string;
  processingStatus: string | null;
  hasOcr: boolean;
  ocrStatus: string | null;
  ocrPageCount: number;
  hasTranscript: boolean;
  sourceCount: number;
}

export interface WorkspaceItemContentProjection {
  textContent: string | null;
  structuredData: Record<string, unknown> | null;
  assetData: Record<string, unknown> | null;
  embedData: Record<string, unknown> | null;
  sourceData: Source[] | null;
}

export interface WorkspaceItemExtractedProjection {
  searchText: string;
  contentPreview: string | null;
  ocrText: string | null;
  ocrPages: PdfData["ocrPages"] | ImageData["ocrPages"] | null;
  transcriptText: string | null;
  transcriptSegments: AudioSegment[] | null;
}

export interface WorkspaceItemUserStateProjection {
  stateKey: string;
  stateType: CardType;
  stateSchemaVersion: number;
  state: Record<string, unknown>;
}

export interface WorkspaceItemSplitResult {
  shell: WorkspaceItemShellProjection;
  content: WorkspaceItemContentProjection;
  extracted: WorkspaceItemExtractedProjection;
  userStates: WorkspaceItemUserStateProjection[];
}

export interface WorkspaceItemTableRows {
  item: WorkspaceItemShellProjection & {
    workspaceId: string;
    sourceVersion: number;
  };
  content: WorkspaceItemContentProjection & {
    workspaceId: string;
    itemId: string;
    dataSchemaVersion: number;
    contentHash: string;
  };
  extracted: WorkspaceItemExtractedProjection & {
    workspaceId: string;
    itemId: string;
  };
  userStates: Array<
    WorkspaceItemUserStateProjection & {
      workspaceId: string;
      itemId: string;
      userId: string;
    }
  >;
}
