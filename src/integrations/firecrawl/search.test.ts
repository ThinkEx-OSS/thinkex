import { afterEach, describe, expect, it, vi } from "vitest";

import { searchPublicWeb } from "#/integrations/firecrawl/search";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("searchPublicWeb", () => {
	it("maps freshness and category onto Firecrawl search filters", async () => {
		let body: Record<string, unknown> | undefined;
		vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === "string") {
				body = JSON.parse(init.body) as Record<string, unknown>;
			}
			return new Response(
				JSON.stringify({
					data: {
						web: [{ title: "Result", url: "https://example.com", description: "Snippet" }],
					},
				}),
			);
		});

		await searchPublicWeb({
			env: { FIRECRAWL_API_KEY: "fc-test" } as Cloudflare.Env,
			query: "transformer architecture",
			freshness: "week",
			category: "pdf",
		});

		expect(body).toMatchObject({
			query: "transformer architecture",
			tbs: "qdr:w",
			categories: [{ type: "pdf" }],
			sources: [{ type: "web" }],
		});
		expect(body).not.toHaveProperty("includeDomains");
	});

	it("reads news and developer result groups", async () => {
		let body: Record<string, unknown> | undefined;
		vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === "string") {
				body = JSON.parse(init.body) as Record<string, unknown>;
			}
			return new Response(
				JSON.stringify({
					data: {
						news: [{ title: "News", url: "https://news.example", snippet: "Today" }],
						developer: [{ title: "Issue", url: "https://github.com/acme/repo/issues/1" }],
					},
				}),
			);
		});

		const result = await searchPublicWeb({
			env: { FIRECRAWL_API_KEY: "fc-test" } as Cloudflare.Env,
			query: "retries",
			source: "news",
			category: "developer",
		});

		expect(body).toMatchObject({
			sources: [{ type: "news" }],
			categories: [{ type: "developer" }],
		});
		expect(result.results).toEqual([
			{ title: "News", url: "https://news.example", snippet: "Today" },
			{ title: "Issue", url: "https://github.com/acme/repo/issues/1", snippet: null },
		]);
	});
});
