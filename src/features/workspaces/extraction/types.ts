import type {
	WorkspaceFileAssetKind,
	WorkspaceFileExtractionMode,
	WorkspaceFileExtractionProviderId,
} from "#/features/workspaces/model/workspace-file/types";
import type { MarkdownProjectionPage } from "#/features/workspaces/extraction/page-markdown-projection";

export type LlamaParseTier = "cost_effective" | "agentic" | "agentic_plus";

export interface WorkspaceFileExtractionWorkflowParams {
	workspaceId: string;
	itemId: string;
	actorUserId: string | null;
	assetKind: WorkspaceFileAssetKind;
	requestId: string | null;
}

export type LiteParseStageOutcome =
	| { durationMs: number; outcome: "skipped" }
	| { durationMs: number; errorType: string; outcome: "error" }
	| {
			durationMs: number;
			markdownLength: number;
			outcome: "success";
			pageCount: number;
	  };

export interface MarkdownExtractionInput {
	workspaceId: string;
	itemId: string;
	body: ReadableStream<Uint8Array>;
	fileName: string;
	contentType: string;
	sizeBytes: number;
	sourceHash: string;
	mode: WorkspaceFileExtractionMode;
}

export interface MarkdownExtractionResult {
	pages: MarkdownProjectionPage[];
	provider: WorkspaceFileExtractionProviderId;
	providerMode: WorkspaceFileExtractionMode;
	metadata: Record<string, string | number | boolean | null>;
}

export interface MarkdownExtractionProvider {
	id: WorkspaceFileExtractionProviderId;
	extract(input: MarkdownExtractionInput): Promise<MarkdownExtractionResult>;
}
