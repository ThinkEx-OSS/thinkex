import { createFirecrawlPdfExtractionProvider } from "#/features/workspaces/extraction/providers/firecrawl-pdf";
import { createGeminiImageMarkdownProvider } from "#/features/workspaces/extraction/providers/gemini-image-markdown";
import type { MarkdownExtractionProvider } from "#/features/workspaces/extraction/types";
import type { WorkspaceFileExtractionProviderId } from "#/features/workspaces/model/workspace-file/types";

export function createMarkdownExtractionProvider(
	providerId: WorkspaceFileExtractionProviderId,
	env: Env,
): MarkdownExtractionProvider {
	switch (providerId) {
		case "gemini_image_markdown":
			return createGeminiImageMarkdownProvider(env);
		case "firecrawl_pdf":
			return createFirecrawlPdfExtractionProvider(env);
	}
}
