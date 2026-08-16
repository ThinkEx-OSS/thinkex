import type { JSONValue, ToolSet } from "ai";
import { z } from "zod";
import { defineAIThreadTool } from "#/features/workspaces/ai/ai-thread-tool";
import {
	fetchPublicWebResource,
	type FreshWebImage,
	webFetchOutputSchema,
} from "#/features/workspaces/ai/web-fetch";
import {
	publicWebSearchResultSchema,
	searchPublicWeb,
	webSearchCategoryValues,
	webSearchFreshnessValues,
	webSearchSourceValues,
} from "#/integrations/firecrawl/search";
const webSearchInputSchema = z.object({
	query: z.string().trim().min(1).describe("Topic or question to search for."),
	include_domains: z
		.array(z.string().trim().min(1))
		.max(20)
		.optional()
		.describe("Optional hostnames to restrict results to. At most 20."),
	freshness: z
		.enum(webSearchFreshnessValues)
		.optional()
		.describe("Only results from the past day, week, or month."),
	source: z
		.enum(webSearchSourceValues)
		.optional()
		.describe("Use news for current events or images for an image gallery. Defaults to web."),
	category: z
		.enum(webSearchCategoryValues)
		.optional()
		.describe(
			"Restrict to PDFs, GitHub, academic sites, or developer docs and issues. Cannot be combined with source images. Use research_discover for papers.",
		),
});

const publicUrlInputSchema = z.object({
	url: z.string().trim().min(1).describe("Public HTTP(S) webpage or image URL to fetch."),
});
const webFetchInputSchema = publicUrlInputSchema.extend({
	kind: z
		.enum(["page", "image"])
		.describe("Use page for rendered webpage text or image to inspect the image pixels."),
});
const webSearchInputExamples: Array<{ input: z.infer<typeof webSearchInputSchema> }> = [
	{
		input: {
			query: "best OCR libraries for PDFs",
		},
	},
	{
		input: {
			query: "thinkex pricing page",
			include_domains: ["thinkex.app"],
		},
	},
	{
		input: {
			query: "openai model release",
			source: "news",
		},
	},
	{
		input: {
			query: "labeled mitochondrion diagram",
			source: "images",
		},
	},
	{
		input: {
			query: "transformer architecture survey",
			category: "pdf",
		},
	},
	{
		input: {
			query: "how do I configure retries",
			category: "developer",
		},
	},
];

const webFetchInputExamples = [
	{ input: { kind: "page" as const, url: "https://example.com" } },
	{ input: { kind: "image" as const, url: "https://example.com/image.png" } },
];

export function createAIThreadWebTools(env: Cloudflare.Env): ToolSet {
	const freshImages = new Map<string, FreshWebImage>();

	return {
		web_search: defineAIThreadTool({
			description:
				"Find relevant public webpages, news, or images for a topic or question. Image searches render a gallery; call web_fetch with an imageUrl only when you need to inspect its pixels.",
			inputSchema: webSearchInputSchema,
			inputExamples: webSearchInputExamples,
			outputSchema: publicWebSearchResultSchema,
			execute: async ({ query, include_domains, freshness, source, category }) =>
				searchPublicWeb({
					env,
					query,
					includeDomains: include_domains,
					freshness,
					source,
					category,
				}),
		}),
		web_fetch: defineAIThreadTool({
			description:
				"Fetch a public webpage or image URL. Set kind to page for rendered Markdown or image to attach its pixels temporarily for this model step. Public PDFs are unsupported; ask the user to upload those to the workspace.",
			inputSchema: webFetchInputSchema,
			inputExamples: webFetchInputExamples,
			outputSchema: webFetchOutputSchema,
			toModelOutput: ({ output, toolCallId }) => {
				const image = freshImages.get(toolCallId);
				freshImages.delete(toolCallId);
				if (!image) {
					return { type: "json" as const, value: output as JSONValue };
				}

				return {
					type: "content" as const,
					value: [
						{ type: "text" as const, text: JSON.stringify(output) },
						{
							type: "file" as const,
							mediaType: image.mediaType,
							data: { type: "data" as const, data: new Uint8Array(image.bytes) },
						},
					],
				};
			},
			execute: async ({ kind, url }, context) => {
				const result = await fetchPublicWebResource({
					abortSignal: context.abortSignal,
					env,
					kind,
					url,
				});
				if (result.image) {
					freshImages.set(context.invocationId, result.image);
				}

				return result.output;
			},
		}),
	};
}
