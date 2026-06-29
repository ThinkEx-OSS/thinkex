import type {
	WorkspaceFileAssetKind,
	WorkspaceFileExtractionMode,
	WorkspaceFileExtractionProviderId,
} from "#/features/workspaces/model/workspace-file/types";
import { workspaceFileExtractionProviders } from "#/features/workspaces/model/workspace-file/types";
import type { MarkdownProjectionPage } from "#/features/workspaces/extraction/page-markdown-projection";

export type MarkdownExtractionProviderId = WorkspaceFileExtractionProviderId;

export type MarkdownExtractionProviderMode = WorkspaceFileExtractionMode;

export { workspaceFileExtractionProviders as markdownExtractionProviders };

export type FirecrawlPdfMode = "fast" | "auto" | "ocr";
export type LlamaParseTier = "cost_effective" | "agentic" | "agentic_plus";

export interface WorkspaceFileExtractionWorkflowParams {
	workspaceId: string;
	itemId: string;
	actorUserId: string | null;
	assetKind: WorkspaceFileAssetKind;
}

export interface MarkdownExtractionInput {
	workspaceId: string;
	itemId: string;
	bytes: Uint8Array;
	fileName: string;
	contentType: string;
	sizeBytes: number;
	sourceHash: string;
	mode: MarkdownExtractionProviderMode;
}

export interface MarkdownExtractionResult {
	pages: MarkdownProjectionPage[];
	provider: MarkdownExtractionProviderId;
	providerMode: MarkdownExtractionProviderMode;
	metadata: Record<string, string | number | boolean | null>;
}

export interface MarkdownExtractionProvider {
	id: MarkdownExtractionProviderId;
	extract(input: MarkdownExtractionInput): Promise<MarkdownExtractionResult>;
}
