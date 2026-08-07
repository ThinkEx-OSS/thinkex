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

export const workspaceDocumentUnsupportedErrorName = "WorkspaceDocumentUnsupportedError";

/**
 * The document itself cannot be read — too long, encrypted, or damaged — as opposed to
 * an extraction that merely failed. Terminal for every tier: the fast pass reaches
 * this verdict in seconds and for free, and no paid provider will reach a different
 * one, so paying for a second opinion only buys the same answer.
 */
export class WorkspaceDocumentUnsupportedError extends Error {
	// Spelled out rather than read off the class, which a minifier may rename while the
	// stage outcome carrying it between steps stays a plain string.
	override name = workspaceDocumentUnsupportedErrorName;
}
