import { describe, expect, it, vi } from "vitest";

import {
	createPendingPdfModelOutput,
	isPendingPdfFallbackInput,
} from "#/features/workspaces/ai/workspace-read-file-fallback";
import type { WorkspaceKernelClient } from "#/features/workspaces/kernel/workspace-kernel-access";

const { kernelsByEnv } = vi.hoisted(() => ({
	kernelsByEnv: new WeakMap<object, WorkspaceKernelClient>(),
}));

vi.mock("#/features/workspaces/kernel/workspace-kernel-access", () => ({
	getWorkspaceKernelFromEnv: async (env: Cloudflare.Env) => kernelsByEnv.get(env as object),
}));

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

	it("allows the fallback only for one initial read", () => {
		expect(isPendingPdfFallbackInput({ requests: [{ mode: "start", path: "/Report.pdf" }] })).toBe(
			true,
		);
		expect(
			isPendingPdfFallbackInput({
				requests: [{ cursor: "opaque", mode: "continue", path: "/Report.pdf" }],
			}),
		).toBe(false);
		expect(
			isPendingPdfFallbackInput({
				requests: [{ mode: "pages", path: "/Report.pdf", range: "2" }],
			}),
		).toBe(false);
		expect(
			isPendingPdfFallbackInput({
				requests: [
					{ mode: "start", path: "/Report.pdf" },
					{ mode: "start", path: "/Appendix.pdf" },
				],
			}),
		).toBe(false);
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

	const env = {
		WORKSPACE_KERNEL_FILES: {
			get: async () => ({
				arrayBuffer: async () => bytes.buffer,
				size: bytes.byteLength,
			}),
		},
	} as unknown as Cloudflare.Env;
	kernelsByEnv.set(env as object, kernel);
	return env;
}
