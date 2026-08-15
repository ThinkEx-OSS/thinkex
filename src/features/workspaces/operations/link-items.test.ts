import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceItem } from "#/features/workspaces/contracts";

const persistence = vi.hoisted(() => ({
	linkWorkspaceItems: vi.fn(),
	resolveWorkspacePaths: vi.fn(),
}));

vi.mock("#/features/workspaces/operations/workspace-operation-context", () => ({
	authorizeWorkspaceOperation: vi.fn(async () => undefined),
	resolveWorkspaceExistingItemPath: ({
		resolution,
		rootFailureCode,
	}: {
		resolution: {
			code?: string;
			item?: WorkspaceItem;
			path: string;
			status: string;
		};
		rootFailureCode: string;
	}) => {
		if (resolution.status === "invalid_path") {
			return {
				failure: { code: resolution.code, path: resolution.path },
				status: "failed",
			};
		}
		if (resolution.status === "root") {
			return {
				failure: { code: rootFailureCode, path: resolution.path },
				status: "failed",
			};
		}
		if (resolution.status === "not_found") {
			return {
				failure: { code: "path_not_found", path: resolution.path },
				status: "failed",
			};
		}
		return {
			item: resolution.item,
			path: resolution.path,
			status: "item",
		};
	},
}));

vi.mock("#/features/workspaces/persistence/workspace-items", () => ({
	linkWorkspaceItems: persistence.linkWorkspaceItems,
	resolveWorkspacePaths: persistence.resolveWorkspacePaths,
}));

import { linkWorkspaceItemsOperation } from "#/features/workspaces/operations/link-items";
import { createWorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";

const documentItem: WorkspaceItem = {
	id: "document-1",
	workspaceId: "workspace-1",
	parentId: null,
	type: "document",
	name: "Cell Notes",
	refKey: "Xk7p2Qa9",
	color: null,
	metadataJson: {},
	sortOrder: 1,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

const flashcardItem: WorkspaceItem = {
	...documentItem,
	id: "flashcard-1",
	type: "flashcard",
	name: "Cell Cards",
};

const sourceFile: WorkspaceItem = {
	...documentItem,
	id: "file-1",
	type: "file",
	name: "Lecture.pdf",
};

function accessContext() {
	return createWorkspaceAccessContext({
		operationId: "link-call",
		scopes: ["workspace:write"],
		userId: "user-1",
		workspaceId: "workspace-1",
	});
}

describe("linkWorkspaceItemsOperation", () => {
	beforeEach(() => {
		persistence.linkWorkspaceItems.mockReset();
		persistence.resolveWorkspacePaths.mockReset();
		persistence.linkWorkspaceItems.mockResolvedValue(undefined);
	});

	it("links multiple sources to the same target in one call", async () => {
		persistence.resolveWorkspacePaths.mockResolvedValue([
			{ item: documentItem, path: "/Cell Notes", status: "item" },
			{ item: sourceFile, path: "/Lecture.pdf", status: "item" },
			{ item: flashcardItem, path: "/Cell Cards", status: "item" },
			{ item: sourceFile, path: "/Lecture.pdf", status: "item" },
		]);

		const result = await linkWorkspaceItemsOperation(accessContext(), {
			items: [
				{
					path: "/Cell Notes",
					relations: [{ kind: "derived_from", path: "/Lecture.pdf", note: "Pages 12-14" }],
				},
				{
					path: "/Cell Cards",
					relations: [{ kind: "derived_from", path: "/Lecture.pdf" }],
				},
			],
		});

		expect(result).toEqual({
			failed: [],
			items: [
				{ path: "/Cell Notes", type: "document" },
				{ path: "/Cell Cards", type: "flashcard" },
			],
		});
		expect(persistence.linkWorkspaceItems).toHaveBeenCalledWith({
			actorUserId: "user-1",
			relations: [
				{
					fromItemId: "document-1",
					kind: "derived_from",
					note: "Pages 12-14",
					toItemId: "file-1",
				},
				{
					fromItemId: "flashcard-1",
					kind: "derived_from",
					toItemId: "file-1",
				},
			],
			workspaceId: "workspace-1",
		});
	});

	it("keeps successful sources when another source or relation fails", async () => {
		persistence.resolveWorkspacePaths.mockResolvedValue([
			{ item: documentItem, path: "/Cell Notes", status: "item" },
			{ item: sourceFile, path: "/Lecture.pdf", status: "item" },
			{ path: "/Missing", status: "not_found" },
			{ item: sourceFile, path: "/Lecture.pdf", status: "item" },
			{ item: flashcardItem, path: "/Cell Cards", status: "item" },
			{ path: "/", status: "root" },
		]);

		const result = await linkWorkspaceItemsOperation(accessContext(), {
			items: [
				{
					path: "/Cell Notes",
					relations: [{ kind: "derived_from", path: "/Lecture.pdf" }],
				},
				{
					path: "/Missing",
					relations: [{ kind: "references", path: "/Lecture.pdf" }],
				},
				{
					path: "/Cell Cards",
					relations: [{ kind: "references", path: "/" }],
				},
			],
		});

		expect(result).toEqual({
			failed: [
				{ code: "path_not_found", index: 1, path: "/Missing" },
				{ code: "relation_path_is_root", index: 2, path: "/" },
			],
			items: [{ path: "/Cell Notes", type: "document" }],
		});
		expect(persistence.linkWorkspaceItems).toHaveBeenCalledWith({
			actorUserId: "user-1",
			relations: [
				{
					fromItemId: "document-1",
					kind: "derived_from",
					toItemId: "file-1",
				},
			],
			workspaceId: "workspace-1",
		});
	});

	it("does not persist when every source fails", async () => {
		persistence.resolveWorkspacePaths.mockResolvedValue([{ path: "/", status: "root" }]);

		const result = await linkWorkspaceItemsOperation(accessContext(), {
			items: [
				{
					path: "/",
					relations: [{ kind: "references", path: "/Lecture.pdf" }],
				},
			],
		});

		expect(result).toEqual({
			failed: [{ code: "cannot_link_root", index: 0, path: "/" }],
			items: [],
		});
		expect(persistence.linkWorkspaceItems).not.toHaveBeenCalled();
	});
});
