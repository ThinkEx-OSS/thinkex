import { browserLinks, type QuickActionBinding } from "@cloudflare/think/tools/browser";
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
import { assertPublicHttpUrl } from "#/features/workspaces/ai/web-access-policy";

const MAX_BROWSER_RESULT_CHARS = 100_000;
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
const webLinksOutputSchema = z.object({
	items: z.array(z.string()),
	truncated: z.boolean(),
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

const browserPageInputExamples = [
	{
		input: {
			url: "https://example.com",
		},
	},
];

export function createAIThreadWebTools(env: Cloudflare.Env): ToolSet {
	const browser: QuickActionBinding = env.BROWSER;
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
				"Fetch a public webpage or image URL. Webpages return rendered Markdown. Images are attached temporarily for this model step so you can inspect them. Public PDFs are unsupported; ask the user to upload those to the workspace.",
			inputSchema: publicUrlInputSchema,
			inputExamples: browserPageInputExamples,
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
			execute: async ({ url }, context) => {
				const result = await fetchPublicWebResource({
					abortSignal: context.abortSignal,
					browser,
					env,
					url,
				});
				if (context.source === "direct" && result.image) {
					freshImages.set(context.invocationId, result.image);
				}

				return result.output;
			},
		}),
		web_links: defineAIThreadTool({
			description: "Load a public webpage and return its rendered links.",
			inputSchema: publicUrlInputSchema,
			inputExamples: browserPageInputExamples,
			outputSchema: webLinksOutputSchema,
			execute: async ({ url }) => {
				const safeUrl = assertPublicHttpUrl(url);
				return truncateLinks(
					await browserLinks(browser, {
						url: safeUrl.toString(),
					}),
				);
			},
		}),
	};
}

function truncateLinks(items: string[]) {
	const result: string[] = [];
	let size = 2;
	let truncated = false;

	for (const item of items) {
		const itemSize = JSON.stringify(item).length + (result.length === 0 ? 0 : 1);

		if (size + itemSize > MAX_BROWSER_RESULT_CHARS) {
			truncated = true;
			break;
		}

		result.push(item);
		size += itemSize;
	}

	return {
		items: truncated ? result : items,
		truncated,
	};
}
