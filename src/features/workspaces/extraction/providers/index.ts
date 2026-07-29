import { createLlamaParseExtractionProvider } from "#/features/workspaces/extraction/providers/llama-parse";
import { createWorkersAiToMarkdownProvider } from "#/features/workspaces/extraction/providers/workers-ai-to-markdown";
import type { MarkdownExtractionProvider } from "#/features/workspaces/extraction/types";
import type { WorkspaceFileExtractionProviderId } from "#/features/workspaces/model/workspace-file/types";

export function createMarkdownExtractionProvider(
	providerId: WorkspaceFileExtractionProviderId,
	env: Env,
): MarkdownExtractionProvider {
	switch (providerId) {
		case "workers_ai_to_markdown":
			return createWorkersAiToMarkdownProvider(env);
		case "llama_parse":
			return createLlamaParseExtractionProvider(env);
	}
}
