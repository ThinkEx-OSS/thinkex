import type { WorkspaceFileAssetKind } from "#/features/workspaces/model/workspace-file/types";

export type MarkdownExtractionProviderId = "liteparse" | "llamaparse" | "workers_ai_to_markdown";

export type MarkdownExtractionProviderMode = "agentic" | "default" | "fast";

export interface WorkspaceFileExtractionWorkflowParams {
	workspaceId: string;
	itemId: string;
	actorUserId: string | null;
	assetKind: WorkspaceFileAssetKind;
	requestId: string | null;
}

export interface StagedPageProjection {
	manifestObjectKey: string;
	markdownLength: number;
	metadata: Record<string, string | number | boolean | null>;
	pageCount: number;
	provider: MarkdownExtractionProviderId;
	providerMode: MarkdownExtractionProviderMode;
	routeReason: string;
	sourceHash: string;
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
