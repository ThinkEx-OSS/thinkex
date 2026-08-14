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
			{ type: "page", title: "News", url: "https://news.example/", snippet: "Today" },
			{
				type: "page",
				title: "Issue",
				url: "https://github.com/acme/repo/issues/1",
				snippet: null,
			},
		]);
	});

	it("returns image metadata without scraping or downloading the images", async () => {
		let body: Record<string, unknown> | undefined;
		vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === "string") {
				body = JSON.parse(init.body) as Record<string, unknown>;
			}
			return new Response(
				JSON.stringify({
					data: {
						images: [
							{
								title: "Mitochondrion diagram",
								imageUrl: "https://cdn.example/mitochondrion.png",
								imageWidth: 1600,
								imageHeight: 900,
								url: "https://example.com/biology",
								position: 1,
							},
						],
					},
				}),
			);
		});

		const result = await searchPublicWeb({
			env: { FIRECRAWL_API_KEY: "fc-test" } as Cloudflare.Env,
			query: "mitochondria",
			source: "images",
		});

		expect(body).toMatchObject({
			query: "mitochondria",
			sources: [{ type: "images" }],
		});
		expect(result.results).toEqual([
			{
				type: "image",
				title: "Mitochondrion diagram",
				url: "https://example.com/biology",
				imageUrl: "https://cdn.example/mitochondrion.png",
				imageWidth: 1600,
				imageHeight: 900,
				position: 1,
			},
		]);
	});

	it("drops unsafe result URLs returned by Firecrawl", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							data: {
								images: [
									{
										imageUrl: "data:image/png;base64,abc",
										url: "https://example.com/source",
									},
									{
										imageUrl: "https://cdn.example/image.png",
										url: "http://127.0.0.1/private",
									},
								],
							},
						}),
					),
			),
		);

		await expect(
			searchPublicWeb({
				env: { FIRECRAWL_API_KEY: "fc-test" } as Cloudflare.Env,
				query: "unsafe images",
				source: "images",
			}),
		).resolves.toEqual({ results: [] });
	});

	it("rejects categories for image searches instead of silently broadening them", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);

		await expect(
			searchPublicWeb({
				env: { FIRECRAWL_API_KEY: "fc-test" } as Cloudflare.Env,
				query: "mitochondria",
				source: "images",
				category: "research",
			}),
		).rejects.toThrow("Image search cannot be combined with a search category.");
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
