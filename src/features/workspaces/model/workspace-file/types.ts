import { z } from "zod";

export const workspaceFileAssetKinds = ["pdf", "image"] as const;
export const workspaceFileAssetKindSchema = z.enum(workspaceFileAssetKinds);

export type WorkspaceFileAssetKind = (typeof workspaceFileAssetKinds)[number];

export const workspaceFileExtractionProviders = ["gemini_image_markdown", "llama_parse"] as const;

export type WorkspaceFileExtractionProviderId = (typeof workspaceFileExtractionProviders)[number];

export type WorkspaceFileExtractionMode =
	| "fast"
	| "default"
	| "cost_effective"
	| "agentic"
	| "agentic_plus";

export interface WorkspaceFileExtractionRoute {
	provider: WorkspaceFileExtractionProviderId;
	mode: WorkspaceFileExtractionMode;
	reason: string;
}
