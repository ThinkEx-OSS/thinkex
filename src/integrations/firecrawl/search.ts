import {
	firecrawlJsonRequest,
	getRecordArrayValue,
	getRecordValue,
	getStringValue,
	truncateFirecrawlText,
} from "#/integrations/firecrawl/client";

const MAX_WEB_SEARCH_SNIPPET_CHARS = 600;

export async function searchPublicWeb(input: {
	env: Cloudflare.Env;
	query: string;
	limit: number;
	includeDomains?: string[];
}) {
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
			limit: input.limit,
			sources: [{ type: "web" }],
			ignoreInvalidURLs: true,
			includeDomains: normalizeHostnameList(input.includeDomains),
		}),
	});
	const data = getRecordValue(response, "data");
	const webResults = getRecordArrayValue(data, "web");

	return {
		results: webResults
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
