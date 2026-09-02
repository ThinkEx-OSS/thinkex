import type { ToolSet } from "ai";
import { z } from "zod";
import { defineAIThreadTool } from "#/features/workspaces/ai/ai-thread-tool";
import { fetchPublicWebPage, webFetchOutputSchema } from "#/features/workspaces/ai/web-fetch";
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

const webFetchInputSchema = z.object({
	url: z.string().trim().min(1).describe("Public HTTP(S) webpage URL to fetch."),
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

const webFetchInputExamples = [{ input: { url: "https://example.com" } }];

export function createAIThreadWebTools(env: Cloudflare.Env): ToolSet {
	return {
		web_search: defineAIThreadTool({
			description:
				"Find relevant public webpages, news, or images for a topic or question. Image searches render a gallery; call view_image with an image's URL only when you need to inspect its pixels.",
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
				"Fetch a public webpage URL as rendered Markdown. For an image's pixels use view_image. Public PDFs are unsupported; ask the user to upload those to the workspace.",
			inputSchema: webFetchInputSchema,
			inputExamples: webFetchInputExamples,
			outputSchema: webFetchOutputSchema,
			execute: async ({ url }, context) =>
				fetchPublicWebPage({ abortSignal: context.abortSignal, env, url }),
		}),
	};
}
