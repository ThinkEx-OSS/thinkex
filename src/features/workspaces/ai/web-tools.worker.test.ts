import type { ToolExecutionOptions } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAIThreadWebTools } from "#/features/workspaces/ai/web-tools";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("web_fetch", () => {
	it("directs public PDFs to the existing workspace upload flow", async () => {
		const tool = createAIThreadWebTools(createEnv()).web_fetch;
		if (!tool?.execute) throw new Error("Expected executable web_fetch");

		await expect(
			tool.execute({ url: "https://example.com/paper.pdf" }, directOptions("pdf-call")),
		).resolves.toMatchObject({
			kind: "unsupported",
			reason: "pdf",
			message: expect.stringContaining("upload the PDF to the workspace"),
		});
	});

	it("scrapes pages once through Firecrawl", async () => {
		const fetchSpy = vi.fn(async () => Response.json({ data: { markdown: "# Rendered page" } }));
		vi.stubGlobal("fetch", fetchSpy);
		const tool = createAIThreadWebTools(createEnv()).web_fetch;
		if (!tool?.execute) throw new Error("Expected executable web_fetch");

		await expect(
			tool.execute({ url: "https://example.com" }, directOptions("page-call")),
		).resolves.toEqual({
			kind: "page",
			url: "https://example.com/",
			content: "# Rendered page",
			truncated: false,
		});
		expect(fetchSpy).toHaveBeenCalledOnce();
		expect(fetchSpy).toHaveBeenCalledWith(new URL("https://api.firecrawl.dev/v2/scrape"), {
			method: "POST",
			headers: expect.any(Headers),
			body: JSON.stringify({
				url: "https://example.com/",
				formats: ["markdown"],
				onlyMainContent: true,
				timeout: 20_000,
			}),
			signal: expect.any(AbortSignal),
		});
	});

	it("accepts a successful page scrape with empty Markdown", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ data: { markdown: "" } })),
		);
		const tool = createAIThreadWebTools(createEnv()).web_fetch;
		if (!tool?.execute) throw new Error("Expected executable web_fetch");

		await expect(
			tool.execute({ url: "https://example.com" }, directOptions("empty-page-call")),
		).resolves.toMatchObject({ kind: "page", content: "" });
	});
});

function directOptions(toolCallId: string): ToolExecutionOptions<unknown> {
	return {
		abortSignal: new AbortController().signal,
		context: {},
		messages: [],
		toolCallId,
	};
}

function createEnv() {
	return {
		BROWSER: {} as Cloudflare.Env["BROWSER"],
	} as Cloudflare.Env;
}
