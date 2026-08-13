import {
	browserLinks,
	browserMarkdown,
	type QuickActionBinding,
} from "@cloudflare/think/tools/browser";
import type { ToolSet } from "ai";
import { z } from "zod";
import { defineAIThreadTool } from "#/features/workspaces/ai/ai-thread-tool";
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
		.describe("Use news for current events. Defaults to web."),
	category: z
		.enum(webSearchCategoryValues)
		.optional()
		.describe(
			"Restrict to PDFs, GitHub, academic sites, or developer docs and issues. Use research_discover for papers.",
		),
});

const browserPageInputSchema = z.object({
	url: z.string().trim().min(1).describe("Public HTTP(S) URL to load in Cloudflare Browser Run."),
});
const webMarkdownOutputSchema = z.object({
	content: z.string(),
	truncated: z.boolean(),
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

	return {
		web_search: defineAIThreadTool({
			description:
				"Find relevant public web pages for a topic or question. Snippets are query-relevant passages.",
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
		web_markdown: defineAIThreadTool({
			description: "Load a public webpage and return its rendered content as Markdown.",
			inputSchema: browserPageInputSchema,
			inputExamples: browserPageInputExamples,
			outputSchema: webMarkdownOutputSchema,
			execute: async ({ url }) => {
				const safeUrl = assertPublicHttpUrl(url);
				return truncateMarkdown(
					await browserMarkdown(browser, {
						url: safeUrl.toString(),
					}),
				);
			},
		}),
		web_links: defineAIThreadTool({
			description: "Load a public webpage and return its rendered links.",
			inputSchema: browserPageInputSchema,
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

function truncateMarkdown(content: string) {
	if (content.length <= MAX_BROWSER_RESULT_CHARS) {
		return {
			content,
			truncated: false,
		};
	}

	return {
		content: content.slice(0, MAX_BROWSER_RESULT_CHARS),
		truncated: true,
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
