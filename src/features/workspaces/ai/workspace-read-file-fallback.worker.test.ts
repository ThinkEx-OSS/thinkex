import { describe, expect, it, vi } from "vitest";

import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import { createPendingPdfModelOutput } from "#/features/workspaces/ai/workspace-read-file-fallback";
import type { WorkspaceKernelClient } from "#/features/workspaces/kernel/workspace-kernel-access";

const fileItem: WorkspaceItemSummary = {
	color: null,
	createdAt: "2026-01-01T00:00:00.000Z",
	deletedAt: null,
	id: "file-1",
	meta: "PDF",
	metadataJson: { assetKind: "pdf" },
	name: "Report.pdf",
	parentId: null,
	sortOrder: 1,
	title: "Report",
	type: "file",
	updatedAt: "2026-01-01T00:00:00.000Z",
	workspaceId: "workspace-1",
};

describe("pending PDF model output", () => {
	it("attaches one small pending PDF with extraction guidance", async () => {
		const bytes = new Uint8Array([1, 2, 3]);
		const output = await createPendingPdfModelOutput({
			env: createEnv(bytes),
			toolInput: { requests: [{ mode: "start", path: "/Report.pdf" }] },
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
		expect(output?.type === "content" ? output.value[0] : null).toMatchObject({
			text: expect.stringContaining("indexed extraction is still running"),
		});
		expect(output?.type === "content" ? output.value[0] : null).toMatchObject({
			text: expect.stringContaining("about 15 seconds"),
		});
	});

	it("keeps the normal pending result for large or batched reads", async () => {
		const largeBytes = new Uint8Array(3.5 * 1024 * 1024 + 1);
		await expect(
			createPendingPdfModelOutput({
				env: createEnv(largeBytes),
				toolInput: { requests: [{ mode: "start", path: "/Report.pdf" }] },
				toolOutput: pendingOutput(),
				workspaceId: "workspace-1",
			}),
		).resolves.toBeNull();

		await expect(
			createPendingPdfModelOutput({
				env: createEnv(new Uint8Array([1, 2, 3])),
				toolInput: {
					requests: [
						{ mode: "start", path: "/Report.pdf" },
						{ mode: "start", path: "/Other.pdf" },
					],
				},
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
		getFileSource: vi.fn(async () => ({
			contentType: "application/pdf",
			fileName: "Report.pdf",
			objectKey: "sources/file-1.pdf",
			sizeBytes: bytes.byteLength,
		})),
		resolvePaths: vi.fn(async () => [
			{ item: fileItem, path: "/Report.pdf", status: "item" as const },
		]),
	} as unknown as WorkspaceKernelClient;

	return {
		WORKSPACE_KERNEL_FILES: {
			get: vi.fn(async () => ({
				arrayBuffer: vi.fn(async () => bytes.buffer),
				size: bytes.byteLength,
			})),
		},
		WorkspaceKernel: { getByName: vi.fn(() => kernel) },
	} as unknown as Cloudflare.Env;
}
