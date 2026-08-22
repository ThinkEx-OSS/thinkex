import { describe, expect, it } from "vitest";

import { addPublicDiscoveryHeaders, negotiatePublicResponse } from "./public-discovery";

const htmlResponse = (status = 200) =>
	new Response("<h1>ThinkEx</h1>", {
		status,
		headers: { "content-type": "text/html; charset=utf-8", Vary: "Accept-Encoding" },
	});

describe("public discovery", () => {
	it("advertises the agent guide and MCP documentation on the homepage", () => {
		const headers = new Headers();
		addPublicDiscoveryHeaders(headers, new Request("https://thinkex.app/"));

		expect(headers.get("Link")).toContain('<https://thinkex.app/llms.txt>; rel="describedby"');
		expect(headers.get("Link")).toContain(
			'<https://docs.thinkex.app/guides/mcp>; rel="service-doc"',
		);
	});

	it("serves substantial structured homepage markdown and varies the cache by Accept", async () => {
		const source = htmlResponse();
		source.headers.delete("Vary");
		const response = negotiatePublicResponse(
			new Request("https://thinkex.app/", { headers: { Accept: "text/markdown" } }),
			source,
		);
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
		expect(response.headers.get("Vary")).toBe("Accept, Accept-Encoding");
		expect(body.length).toBeGreaterThan(500);
		expect(body).toMatch(/^# ThinkEx\n/m);
		expect(body).toMatch(/^## What you can do$/m);
	});

	it("honors quality values and explicit exclusions", async () => {
		const html = negotiatePublicResponse(
			new Request("https://thinkex.app/", {
				headers: { Accept: "text/markdown;q=0.5, text/html;q=0.9" },
			}),
			htmlResponse(),
		);
		const unacceptable = negotiatePublicResponse(
			new Request("https://thinkex.app/", {
				headers: { Accept: "application/json, text/*;q=0" },
			}),
			htmlResponse(),
		);

		expect(html.headers.get("content-type")).toContain("text/html");
		expect(await html.text()).toContain("<h1>ThinkEx</h1>");
		expect(unacceptable.status).toBe(406);
	});

	it("returns a recoverable markdown body with the original 404 status", async () => {
		const response = negotiatePublicResponse(
			new Request("https://thinkex.app/missing", { headers: { Accept: "text/markdown" } }),
			htmlResponse(404),
		);
		const body = await response.text();

		expect(response.status).toBe(404);
		expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
		expect(body).toContain("# ThinkEx page not found");
		expect(body).toContain("https://thinkex.app/llms.txt");
		expect(body).toContain("https://thinkex.app/sitemap.xml");
	});

	it("normalizes unmatched API routes to structured JSON", async () => {
		const response = negotiatePublicResponse(
			new Request("https://thinkex.app/api/missing"),
			htmlResponse(404),
		);

		expect(response.status).toBe(404);
		expect(response.headers.get("content-type")).toContain("application/json");
		expect(response.headers.get("x-error-code")).toBe("API_NOT_FOUND");
		expect(await response.json()).toMatchObject({
			code: "API_NOT_FOUND",
			message: "No ThinkEx API endpoint exists at /api/missing.",
			details: {
				resolution: "See https://thinkex.app/developers for supported integrations.",
			},
		});
	});
});
