import { describe, expect, it } from "vitest";

import { createPendingPdfModelOutput } from "#/features/workspaces/ai/workspace-read-file-fallback";
import type { WorkspaceKernelClient } from "#/features/workspaces/kernel/workspace-kernel-access";

describe("pending PDF model output", () => {
	it("attaches only a small pending PDF", async () => {
		const bytes = new Uint8Array([1, 2, 3]);
		const output = await createPendingPdfModelOutput({
			env: createEnv(bytes),
			toolOutput: pendingOutput(),
			workspaceId: "workspace-1",
		});

		expect(output).toMatchObject({
			type: "content",
			value: [
				{ type: "text" },
				{
					data: { data: bytes, type: "data" },
					filename: "Report.pdf",
					mediaType: "application/pdf",
					type: "file",
				},
			],
		});
		const text = output?.type === "content" ? output.value[0] : null;
		expect(text).toMatchObject({
			text: expect.stringContaining('"retryAfterSeconds":15'),
		});
		expect(text).toMatchObject({
			text: expect.stringContaining("The original PDF is attached temporarily"),
		});

		const largeBytes = new Uint8Array(3.5 * 1024 * 1024 + 1);
		await expect(
			createPendingPdfModelOutput({
				env: createEnv(largeBytes),
				toolOutput: pendingOutput(),
				workspaceId: "workspace-1",
			}),
		).resolves.toBeNull();
	});
});

function pendingOutput() {
	return {
		references: [],
		results: [
			{
				elapsedSeconds: 8,
				itemId: "file-1",
				path: "/Report.pdf",
				phase: "extracting",
				retryAfterSeconds: 15,
				status: "pending",
				type: "file",
			},
		],
	};
}

function createEnv(bytes: Uint8Array): Cloudflare.Env {
	const kernel = {
		getFileSource: async () => ({
			contentType: "application/pdf",
			fileName: "Report.pdf",
			objectKey: "sources/file-1.pdf",
			sizeBytes: bytes.byteLength,
		}),
	} as unknown as WorkspaceKernelClient;

	return {
		WORKSPACE_KERNEL_FILES: {
			get: async () => ({
				arrayBuffer: async () => bytes.buffer,
				size: bytes.byteLength,
			}),
		},
		WorkspaceKernel: { getByName: () => kernel },
	} as unknown as Cloudflare.Env;
}
