import type { ToolExecutionOptions } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

const viewWorkspaceImageOperation = vi.hoisted(() => vi.fn());

vi.mock("#/features/workspaces/operations/view-image", () => ({
	viewWorkspaceImageOperation,
}));

import { createAIThreadImageTools } from "#/features/workspaces/ai/image-tools";

afterEach(() => {
	vi.unstubAllGlobals();
	viewWorkspaceImageOperation.mockReset();
});

const threadContext = {
	userId: "user-1",
	workspaceId: "workspace-1",
} as Parameters<typeof createAIThreadImageTools>[0]["threadContext"];

describe("view_image", () => {
	it("sends fetched web image bytes to the model once without persisting them in output", async () => {
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
		const tool = createAIThreadImageTools({
			env: createEnv(images.binding),
			threadContext,
		}).view_image;
		if (!tool?.execute || !tool.toModelOutput) throw new Error("Expected executable view_image");
		const options = directOptions("image-call");

		const output = await tool.execute({ url: "https://cdn.example/image.png" }, options);
		expect(output).toEqual({
			kind: "image",
			source: "https://cdn.example/image.png",
			mediaType: "image/jpeg",
			sizeBytes: 3,
		});
		expect(JSON.stringify(output)).not.toContain("9,8,7");

		const freshModelOutput = await tool.toModelOutput({
			input: { url: "https://cdn.example/image.png" },
			output,
			toolCallId: "image-call",
		});
		expect(freshModelOutput).toMatchObject({
			type: "content",
			value: [{ type: "text" }, { type: "file", mediaType: "image/jpeg", data: { type: "data" } }],
		});

		expect(
			tool.toModelOutput({
				input: { url: "https://cdn.example/image.png" },
				output,
				toolCallId: "image-call",
			}),
		).toEqual({ type: "json", value: output });
	});

	it("attaches a workspace image's pixels through the view operation", async () => {
		viewWorkspaceImageOperation.mockResolvedValue({
			bytes: new Uint8Array([4, 5, 6]).buffer,
			mediaType: "image/jpeg",
			path: "/Biology/Krebs cycle.png",
			sizeBytes: 3,
		});
		const tool = createAIThreadImageTools({
			env: createEnv(createImagesBinding().binding),
			threadContext,
		}).view_image;
		if (!tool?.execute || !tool.toModelOutput) throw new Error("Expected executable view_image");

		const output = await tool.execute(
			{ path: "/Biology/Krebs cycle.png" },
			directOptions("workspace-call"),
		);
		expect(output).toEqual({
			kind: "image",
			source: "/Biology/Krebs cycle.png",
			mediaType: "image/jpeg",
			sizeBytes: 3,
		});
		expect(viewWorkspaceImageOperation).toHaveBeenCalledWith(
			expect.objectContaining({ workspaceId: "workspace-1" }),
			{ path: "/Biology/Krebs cycle.png" },
		);

		expect(
			await tool.toModelOutput({
				input: { path: "/Biology/Krebs cycle.png" },
				output,
				toolCallId: "workspace-call",
			}),
		).toMatchObject({
			type: "content",
			value: [{ type: "text" }, { type: "file", mediaType: "image/jpeg" }],
		});
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
		const tool = createAIThreadImageTools({
			env: createEnv(createImagesBinding().binding),
			threadContext,
		}).view_image;
		if (!tool?.execute) throw new Error("Expected executable view_image");

		await expect(
			tool.execute({ url: "https://example.com/paper.pdf" }, directOptions("pdf-call")),
		).resolves.toMatchObject({
			kind: "unsupported",
			reason: "pdf",
			message: expect.stringContaining("upload the PDF to the workspace"),
		});
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
		const tool = createAIThreadImageTools({
			env: createEnv(images.binding),
			threadContext,
		}).view_image;
		if (!tool?.execute) throw new Error("Expected executable view_image");

		await expect(
			tool.execute({ url: "https://cdn.example/huge.png" }, directOptions("large-image-call")),
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
