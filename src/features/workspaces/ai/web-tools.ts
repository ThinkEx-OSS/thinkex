import {
	browserLinks,
	browserMarkdown,
	type QuickActionBinding,
} from "@cloudflare/think/tools/browser";
import type { ToolSet } from "ai";
import { tool } from "ai";
import { z } from "zod";
import { searchPublicWeb } from "#/integrations/firecrawl/search";
import { assertPublicHttpUrl } from "#/features/workspaces/ai/web-access-policy";

const MAX_BROWSER_RESULT_CHARS = 100_000;
const webSearchInputSchema = z.object({
	query: z.string().trim().min(1).describe("Topic or question to search for."),
	limit: z.number().int().min(1).max(25).optional().describe("Maximum results to return."),
	include_domains: z
		.array(z.string().trim().min(1))
		.max(20)
		.optional()
		.describe("Optional hostnames to restrict results to."),
});

const browserPageInputSchema = z.object({
	url: z.url().describe("Public HTTP(S) URL to load in Cloudflare Browser Run."),
});

const webSearchInputExamples = [
	{
		input: {
			query: "best OCR libraries for PDFs",
		},
	},
	{
		input: {
			query: "thinkex pricing page",
			include_domains: ["thinkex.app"],
			limit: 3,
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
	const browser = env.BROWSER as unknown as QuickActionBinding;

	return {
		web_search: tool({
			description: "Find relevant public web pages for a topic or question.",
			inputSchema: webSearchInputSchema,
			inputExamples: webSearchInputExamples,
			strict: true,
			execute: async ({ query, limit, include_domains }) =>
				searchPublicWeb({
					env,
					query,
					limit: limit ?? 8,
					includeDomains: include_domains,
				}),
		}),
		web_markdown: tool({
			description: "Load a public webpage and return its rendered content as Markdown.",
			inputSchema: browserPageInputSchema,
			inputExamples: browserPageInputExamples,
			strict: true,
			execute: async ({ url }) => {
				const safeUrl = assertPublicHttpUrl(url);
				return truncateMarkdown(
					await browserMarkdown(browser, {
						url: safeUrl.toString(),
					}),
				);
			},
		}),
		web_links: tool({
			description: "Load a public webpage and return its rendered links.",
			inputSchema: browserPageInputSchema,
			inputExamples: browserPageInputExamples,
			strict: true,
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
