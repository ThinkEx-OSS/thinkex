import { firecrawlJsonRequest, getRecordValue } from "#/integrations/firecrawl/client";

const FIRECRAWL_SCRAPE_TIMEOUT_MS = 20_000;

export async function scrapePublicWebPage(input: {
	abortSignal?: AbortSignal;
	env: Cloudflare.Env;
	url: string;
}) {
	const timeoutSignal = AbortSignal.timeout(FIRECRAWL_SCRAPE_TIMEOUT_MS);
	const response = await firecrawlJsonRequest({
		abortSignal: input.abortSignal
			? AbortSignal.any([input.abortSignal, timeoutSignal])
			: timeoutSignal,
		env: input.env,
		path: "/v2/scrape",
		operation: "Web page scrape",
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			url: input.url,
			formats: ["markdown"],
			onlyMainContent: true,
			timeout: FIRECRAWL_SCRAPE_TIMEOUT_MS,
		}),
	});
	const markdown = getRecordValue(getRecordValue(response, "data"), "markdown");
	if (typeof markdown !== "string") {
		throw new Error("Web page scrape did not return Markdown.");
	}

	return markdown;
}
