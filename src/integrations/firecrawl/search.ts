import { z } from "zod";

import { parsePublicHttpUrl } from "#/features/workspaces/ai/web-access-policy";

import {
	firecrawlJsonRequest,
	getRecordArrayValue,
	getNumberValue,
	getRecordValue,
	getStringValue,
	truncateFirecrawlText,
} from "#/integrations/firecrawl/client";

const MAX_WEB_SEARCH_SNIPPET_CHARS = 600;
const WEB_SEARCH_RESULT_LIMIT = 8;
export const webSearchFreshnessValues = ["day", "week", "month"] as const;
export const webSearchSourceValues = ["web", "news", "images"] as const;
export const webSearchCategoryValues = ["pdf", "github", "research", "developer"] as const;
const webSearchFreshnessTbs = {
	day: "qdr:d",
	week: "qdr:w",
	month: "qdr:m",
} satisfies Record<(typeof webSearchFreshnessValues)[number], string>;

export const publicWebSearchResultSchema = z.object({
	results: z.array(
		z.discriminatedUnion("type", [
			z.object({
				type: z.literal("page"),
				title: z.string().nullable(),
				url: z.string(),
				snippet: z.string().nullable(),
			}),
			z.object({
				type: z.literal("image"),
				title: z.string().nullable(),
				url: z.string(),
				imageUrl: z.string(),
				imageWidth: z.number().int().positive().nullable(),
				imageHeight: z.number().int().positive().nullable(),
				position: z.number().int().positive().nullable(),
			}),
		]),
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
	if (input.source === "images" && input.category) {
		throw new Error("Image search cannot be combined with a search category.");
	}

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
	if (input.source === "images") {
		return {
			results: getRecordArrayValue(data, "images").flatMap((item) => {
				const imageUrl = parsePublicHttpUrl(getStringValue(item, "imageUrl"));
				const sourceUrl = parsePublicHttpUrl(getStringValue(item, "url"));
				if (!imageUrl || !sourceUrl) return [];

				return [
					{
						type: "image" as const,
						title: getStringValue(item, "title"),
						url: sourceUrl.toString(),
						imageUrl: imageUrl.toString(),
						imageWidth: positiveIntegerOrNull(getNumberValue(item, "imageWidth")),
						imageHeight: positiveIntegerOrNull(getNumberValue(item, "imageHeight")),
						position: positiveIntegerOrNull(getNumberValue(item, "position")),
					},
				];
			}),
		};
	}

	const hits = [
		...getRecordArrayValue(data, "web"),
		...getRecordArrayValue(data, "news"),
		...getRecordArrayValue(data, "developer"),
	];

	return {
		results: hits.flatMap((item) => {
			const url = parsePublicHttpUrl(
				getStringValue(item, "url") ??
					getStringValue(getRecordValue(item, "metadata"), "sourceURL") ??
					getStringValue(getRecordValue(item, "metadata"), "url"),
			);
			if (!url) return [];

			return [
				{
					type: "page" as const,
					title:
						getStringValue(item, "title") ??
						getStringValue(getRecordValue(item, "metadata"), "title"),
					url: url.toString(),
					snippet: truncateFirecrawlText(
						getStringValue(item, "description") ??
							getStringValue(item, "snippet") ??
							getStringValue(getRecordValue(item, "metadata"), "description"),
						MAX_WEB_SEARCH_SNIPPET_CHARS,
					),
				},
			];
		}),
	};
}

function positiveIntegerOrNull(value: number | null) {
	return value !== null && Number.isInteger(value) && value > 0 ? value : null;
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
