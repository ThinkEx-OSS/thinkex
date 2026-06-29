import type {
	MarkdownExtractionProvider,
	MarkdownExtractionProviderId,
} from "#/features/workspaces/extraction/types";

const implementedMarkdownExtractionProviders = [
	"firecrawl",
	"llama_parse",
	"workers_ai_to_markdown",
] as const satisfies readonly MarkdownExtractionProviderId[];

type StubMarkdownExtractionProviderId = Exclude<
	MarkdownExtractionProviderId,
	(typeof implementedMarkdownExtractionProviders)[number]
>;

export function createStubMarkdownExtractionProvider(
	id: StubMarkdownExtractionProviderId,
): MarkdownExtractionProvider {
	return {
		id,
		async extract() {
			throw new Error(
				`${id} markdown extraction is intentionally stubbed. Add credentials, pricing limits, and routing rules before routing uploads here.`,
			);
		},
	};
}
