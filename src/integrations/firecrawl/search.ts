import { z } from "zod";

import {
	firecrawlJsonRequest,
	getRecordArrayValue,
	getRecordValue,
	getStringValue,
	truncateFirecrawlText,
} from "#/integrations/firecrawl/client";

const MAX_WEB_SEARCH_SNIPPET_CHARS = 600;
const WEB_SEARCH_RESULT_LIMIT = 8;
export const webSearchFreshnessValues = ["day", "week", "month"] as const;
export const webSearchSourceValues = ["web", "news"] as const;
export const webSearchCategoryValues = ["pdf", "github", "research", "developer"] as const;
const webSearchFreshnessTbs = {
	day: "qdr:d",
	week: "qdr:w",
	month: "qdr:m",
} satisfies Record<(typeof webSearchFreshnessValues)[number], string>;

export const publicWebSearchResultSchema = z.object({
	results: z.array(
		z.object({
			title: z.string().nullable(),
			url: z.string().nullable(),
			snippet: z.string().nullable(),
		}),
	),
});

export async function searchPublicWeb(input: {
	env: Cloudflare.Env;
	query: string;
	includeDomains?: string[];
	freshness?: (typeof webSearchFreshnessValues)[number];
	source?: (typeof webSearchSourceValues)[number];
	category?: (typeof webSearchCategoryValues)[number];
}): Promise<z.output<typeof publicWebSearchResultSchema>> {
	const response = await firecrawlJsonRequest({
		env: input.env,
		path: "/v2/search",
		operation: "Web search",
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			query: input.query,
			limit: WEB_SEARCH_RESULT_LIMIT,
			sources: [{ type: input.source ?? "web" }],
			ignoreInvalidURLs: true,
			includeDomains: normalizeHostnameList(input.includeDomains),
			tbs: input.freshness ? webSearchFreshnessTbs[input.freshness] : undefined,
			categories: input.category ? [{ type: input.category }] : undefined,
		}),
	});
	const data = getRecordValue(response, "data");
	const hits = [
		...getRecordArrayValue(data, "web"),
		...getRecordArrayValue(data, "news"),
		...getRecordArrayValue(data, "developer"),
	];

	return {
		results: hits
			.map((item) => ({
				title:
					getStringValue(item, "title") ??
					getStringValue(getRecordValue(item, "metadata"), "title"),
				url:
					getStringValue(item, "url") ??
					getStringValue(getRecordValue(item, "metadata"), "sourceURL") ??
					getStringValue(getRecordValue(item, "metadata"), "url"),
				snippet: truncateFirecrawlText(
					getStringValue(item, "description") ??
						getStringValue(item, "snippet") ??
						getStringValue(getRecordValue(item, "metadata"), "description"),
					MAX_WEB_SEARCH_SNIPPET_CHARS,
				),
			}))
			.filter((item) => item.title && item.url),
	};
}

function normalizeHostnameList(value: string[] | undefined) {
	if (!value || value.length === 0) {
		return undefined;
	}

	const normalized = Array.from(
		new Set(
			value.map((item) => {
				const hostname = item.trim().toLowerCase().replace(/\.$/, "");

				if (!hostname) {
					throw new Error("Domain filters must be non-empty hostnames.");
				}

				if (
					hostname.includes("://") ||
					hostname.includes("/") ||
					hostname.includes("?") ||
					hostname.includes("#")
				) {
					throw new Error("Domain filters must be hostnames only.");
				}

				new URL(`https://${hostname}`);
				return hostname;
			}),
		),
	);

	return normalized.length > 0 ? normalized : undefined;
}
