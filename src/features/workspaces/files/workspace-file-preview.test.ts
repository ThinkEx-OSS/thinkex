import { beforeEach, describe, expect, it, vi } from "vitest";

const requestWorkspaceFileProcessor = vi.hoisted(() => vi.fn());

vi.mock("#/features/workspaces/files/workspace-file-processor", () => ({
	requestWorkspaceFileProcessor,
}));

import { createWorkspaceFilePreview } from "#/features/workspaces/files/workspace-file-preview";

beforeEach(() => {
	requestWorkspaceFileProcessor.mockReset();
});

describe("workspace file preview", () => {
	it("preserves the processor response size for fixed-length storage", async () => {
		const bytes = new Uint8Array([1, 2, 3]);
		requestWorkspaceFileProcessor.mockResolvedValue(
			new Response(bytes.slice().buffer, {
				headers: { "content-length": String(bytes.byteLength) },
			}),
		);

		const preview = await createWorkspaceFilePreview({} as Cloudflare.Env, {
			assetKind: "pdf",
			body: createStream(bytes),
			contentType: "application/pdf",
			sizeBytes: bytes.byteLength,
		});

		expect(preview.sizeBytes).toBe(bytes.byteLength);
		expect(new Uint8Array(await new Response(preview.body).arrayBuffer())).toEqual(bytes);
	});

	it("rejects a processor response without a valid content length", async () => {
		requestWorkspaceFileProcessor.mockResolvedValue(new Response(new Uint8Array([1])));

		await expect(
			createWorkspaceFilePreview({} as Cloudflare.Env, {
				assetKind: "image",
				body: createStream(new Uint8Array([1])),
				contentType: "image/png",
				sizeBytes: 1,
			}),
		).rejects.toThrow("Workspace preview response is missing a valid content length.");
	});
});

function createStream(bytes: Uint8Array) {
	const body = new Response(bytes.slice().buffer).body;
	if (!body) {
		throw new Error("Test stream was not created.");
	}
	return body;
}
