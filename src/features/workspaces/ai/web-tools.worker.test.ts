import type { ToolExecutionOptions } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAIThreadWebTools } from "#/features/workspaces/ai/web-tools";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("web_fetch", () => {
	it("sends fetched image bytes to the model once without persisting them in output", async () => {
		const images = createImagesBinding(new Uint8Array([9, 8, 7]));
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(new Uint8Array([1, 2, 3]), {
						headers: { "content-length": "3", "content-type": "image/png" },
					}),
			),
		);
		const tool = createAIThreadWebTools(createEnv(images.binding)).web_fetch;
		if (!tool?.execute || !tool.toModelOutput) throw new Error("Expected executable web_fetch");
		const options = directOptions("image-call");

		const output = await tool.execute(
			{ kind: "image", url: "https://cdn.example/image.png" },
			options,
		);
		expect(output).toEqual({
			kind: "image",
			url: "https://cdn.example/image.png",
			mediaType: "image/jpeg",
			sizeBytes: 3,
		});
		expect(JSON.stringify(output)).not.toContain("9,8,7");

		const freshModelOutput = await tool.toModelOutput({
			input: { kind: "image", url: "https://cdn.example/image.png" },
			output,
			toolCallId: "image-call",
		});
		expect(freshModelOutput).toMatchObject({
			type: "content",
			value: [{ type: "text" }, { type: "file", mediaType: "image/jpeg", data: { type: "data" } }],
		});

		expect(
			tool.toModelOutput({
				input: { kind: "image", url: "https://cdn.example/image.png" },
				output,
				toolCallId: "image-call",
			}),
		).toEqual({ type: "json", value: output });
	});

	it("directs public PDFs to the existing workspace upload flow", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(new Uint8Array([1]), {
						headers: { "content-type": "application/pdf" },
					}),
			),
		);
		const tool = createAIThreadWebTools(createEnv(createImagesBinding().binding)).web_fetch;
		if (!tool?.execute) throw new Error("Expected executable web_fetch");

		await expect(
			tool.execute(
				{ kind: "image", url: "https://example.com/paper.pdf" },
				directOptions("pdf-call"),
			),
		).resolves.toMatchObject({
			kind: "unsupported",
			reason: "pdf",
			message: expect.stringContaining("upload the PDF to the workspace"),
		});
	});

	it("scrapes pages once through Firecrawl", async () => {
		const fetchSpy = vi.fn(async () => Response.json({ data: { markdown: "# Rendered page" } }));
		vi.stubGlobal("fetch", fetchSpy);
		const tool = createAIThreadWebTools(createEnv(createImagesBinding().binding)).web_fetch;
		if (!tool?.execute) throw new Error("Expected executable web_fetch");

		await expect(
			tool.execute({ kind: "page", url: "https://example.com" }, directOptions("page-call")),
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
		const tool = createAIThreadWebTools(createEnv(createImagesBinding().binding)).web_fetch;
		if (!tool?.execute) throw new Error("Expected executable web_fetch");

		await expect(
			tool.execute({ kind: "page", url: "https://example.com" }, directOptions("empty-page-call")),
		).resolves.toMatchObject({ kind: "page", content: "" });
	});

	it("cancels an image response rejected by its content length", async () => {
		const cancel = vi.fn();
		const body = new ReadableStream<Uint8Array>({ cancel });
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(body, {
						headers: {
							"content-length": String(50 * 1024 * 1024),
							"content-type": "image/png",
						},
					}),
			),
		);
		const images = createImagesBinding();
		const tool = createAIThreadWebTools(createEnv(images.binding)).web_fetch;
		if (!tool?.execute) throw new Error("Expected executable web_fetch");

		await expect(
			tool.execute(
				{ kind: "image", url: "https://cdn.example/huge.png" },
				directOptions("large-image-call"),
			),
		).rejects.toThrow("image exceeds");
		expect(cancel).toHaveBeenCalledOnce();
		expect(images.input).not.toHaveBeenCalled();
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

function createImagesBinding(output = new Uint8Array([1])) {
	const image = vi.fn(() => new Response(output).body!);
	const transformOutput = vi.fn(async () => ({ image }));
	const transform = vi.fn(() => ({ output: transformOutput }));
	const input = vi.fn(() => ({ output: transformOutput, transform }));

	return {
		binding: { input } as unknown as ImagesBinding,
		input,
	};
}

function createEnv(images: ImagesBinding) {
	return {
		BROWSER: {} as Cloudflare.Env["BROWSER"],
		IMAGES: images,
	} as Cloudflare.Env;
}
