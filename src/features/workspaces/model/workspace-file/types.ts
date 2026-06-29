export const workspaceFileAssetKinds = ["pdf", "image"] as const;

export type WorkspaceFileAssetKind = (typeof workspaceFileAssetKinds)[number];

export const workspaceFileExtractionProviders = [
	"firecrawl",
	"workers_ai_to_markdown",
	"mistral_ocr",
	"llama_parse",
] as const;

export type WorkspaceFileExtractionProviderId = (typeof workspaceFileExtractionProviders)[number];

export type WorkspaceFileExtractionMode =
	| "fast"
	| "auto"
	| "ocr"
	| "default"
	| "stub"
	| "cost_effective"
	| "agentic"
	| "agentic_plus";

export interface WorkspaceFileExtractionRoute {
	provider: WorkspaceFileExtractionProviderId;
	mode: WorkspaceFileExtractionMode;
	reason: string;
}

export type WorkspaceFilePreviewGeneratorId = "pdf_webp" | "image_webp";

export type WorkspaceFileAiReadStrategy = "markdown_extraction";
