import { createFirecrawlPdfExtractionProvider } from "#/features/workspaces/extraction/providers/firecrawl";
import { createLlamaParseExtractionProvider } from "#/features/workspaces/extraction/providers/llama-parse";
import { createStubMarkdownExtractionProvider } from "#/features/workspaces/extraction/providers/stubs";
import { createWorkersAiToMarkdownProvider } from "#/features/workspaces/extraction/providers/workers-ai-to-markdown";
import type {
	MarkdownExtractionProvider,
	MarkdownExtractionProviderId,
} from "#/features/workspaces/extraction/types";

export function createMarkdownExtractionProvider(
	providerId: MarkdownExtractionProviderId,
	env: Env,
): MarkdownExtractionProvider {
	switch (providerId) {
		case "firecrawl":
			return createFirecrawlPdfExtractionProvider(env);
		case "workers_ai_to_markdown":
			return createWorkersAiToMarkdownProvider(env);
		case "llama_parse":
			return createLlamaParseExtractionProvider(env);
		case "mistral_ocr":
			return createStubMarkdownExtractionProvider(providerId);
	}
}
