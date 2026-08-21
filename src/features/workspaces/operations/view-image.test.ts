import { beforeEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({
	getWorkspaceItemRefKeyIndex: vi.fn(),
	readWorkspaceFileSource: vi.fn(),
	resolveWorkspacePaths: vi.fn(),
}));
const bucket = vi.hoisted(() => ({ get: vi.fn() }));
const normalizeChatImageToJpeg = vi.hoisted(() => vi.fn());

vi.mock("#/features/workspaces/operations/workspace-operation-context", () => ({
	authorizeWorkspaceOperation: vi.fn(async () => undefined),
}));
vi.mock("#/features/workspaces/persistence/workspace-items", () => ({
	getWorkspaceItemRefKeyIndex: persistence.getWorkspaceItemRefKeyIndex,
	resolveWorkspacePaths: persistence.resolveWorkspacePaths,
}));
vi.mock("#/features/workspaces/persistence/workspace-files", () => ({
	readWorkspaceFileSource: persistence.readWorkspaceFileSource,
}));
vi.mock("#/features/workspaces/conversion/image-normalizer", () => ({
	normalizeChatImageToJpeg,
}));
vi.mock("cloudflare:workers", () => ({ env: { WORKSPACE_FILES: bucket } }));

import { viewWorkspaceImageOperation } from "#/features/workspaces/operations/view-image";
import { createWorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";

const context = () =>
	createWorkspaceAccessContext({
		operationId: "view-call",
		scopes: ["workspace:read"],
		userId: "user-1",
		workspaceId: "workspace-1",
	});

const imageItem = {
	id: "item-1",
	refKey: "aB3xK9pQ",
	type: "file",
	metadataJson: { assetKind: "image" },
};

describe("viewWorkspaceImageOperation", () => {
	beforeEach(() => {
		persistence.getWorkspaceItemRefKeyIndex.mockReset();
		persistence.readWorkspaceFileSource.mockReset();
		persistence.resolveWorkspacePaths.mockReset();
		bucket.get.mockReset();
		normalizeChatImageToJpeg.mockReset();
	});

	it("returns normalized pixels for an image file resolved by path", async () => {
		persistence.resolveWorkspacePaths.mockResolvedValue([
			{ item: imageItem, path: "/Diagrams/cell.png", status: "item" },
		]);
		persistence.readWorkspaceFileSource.mockResolvedValue({ objectKey: "objects/cell" });
		bucket.get.mockResolvedValue({ body: "stream" });
		normalizeChatImageToJpeg.mockResolvedValue({
			bytes: new Uint8Array([1, 2]).buffer,
			contentType: "image/jpeg",
			sizeBytes: 2,
		});

		await expect(
			viewWorkspaceImageOperation(context(), { path: "/Diagrams/cell.png" }),
		).resolves.toMatchObject({
			mediaType: "image/jpeg",
			path: "/Diagrams/cell.png",
			sizeBytes: 2,
		});
		expect(bucket.get).toHaveBeenCalledWith("objects/cell");
	});

	it("resolves refs through the workspace ref index", async () => {
		persistence.getWorkspaceItemRefKeyIndex.mockResolvedValue(
			new Map([["aB3xK9pQ", { item: imageItem, path: "/Diagrams/cell.png" }]]),
		);
		persistence.readWorkspaceFileSource.mockResolvedValue({ objectKey: "objects/cell" });
		bucket.get.mockResolvedValue({ body: "stream" });
		normalizeChatImageToJpeg.mockResolvedValue({
			bytes: new Uint8Array([1]).buffer,
			contentType: "image/jpeg",
			sizeBytes: 1,
		});

		await expect(
			viewWorkspaceImageOperation(context(), { ref: "aB3xK9pQ" }),
		).resolves.toMatchObject({ path: "/Diagrams/cell.png" });
	});

	it("points non-image files back to workspace_read_items", async () => {
		persistence.resolveWorkspacePaths.mockResolvedValue([
			{
				item: { ...imageItem, metadataJson: { assetKind: "pdf" } },
				path: "/Notes/paper.pdf",
				status: "item",
			},
		]);

		await expect(
			viewWorkspaceImageOperation(context(), { path: "/Notes/paper.pdf" }),
		).rejects.toThrow("workspace_read_items");
	});

	it("rejects items that are not files", async () => {
		persistence.resolveWorkspacePaths.mockResolvedValue([
			{ item: { id: "d1", type: "document", metadataJson: null }, path: "/Notes", status: "item" },
		]);

		await expect(viewWorkspaceImageOperation(context(), { path: "/Notes" })).rejects.toThrow(
			"not an image file",
		);
	});

	it("names the missing path when nothing exists there", async () => {
		persistence.resolveWorkspacePaths.mockResolvedValue([
			{ path: "/gone.png", status: "not_found" },
		]);

		await expect(viewWorkspaceImageOperation(context(), { path: "/gone.png" })).rejects.toThrow(
			"No workspace image exists at /gone.png",
		);
	});
});
