import {
	getWorkspaceOperationContext,
	resolveWorkspaceOperationPath,
} from "#/features/workspaces/operations/workspace-operation-context";
import {
	resolveWorkspaceRelations,
	type WorkspaceRelationInput,
	workspaceRelationFailureCodes,
} from "#/features/workspaces/operations/relations";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import { parseMarkdownToTiptapDocumentProjection } from "#/features/workspaces/documents/document-markdown";
import { stringifyTiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";
import type { WorkspaceKernelClient } from "#/features/workspaces/kernel/workspace-kernel-access";
import {
	getParentWorkspacePath,
	getWorkspacePathName,
	joinWorkspaceItemPath,
	normalizeWorkspacePath,
	WorkspaceKernelPathError,
	type WorkspaceKernelTree,
} from "#/features/workspaces/kernel/workspace-kernel-paths";
import { WorkspaceKernelNameConflictError } from "#/features/workspaces/kernel/workspace-kernel-store";

export interface CreateWorkspaceItemOperationInput {
	type: "document" | "folder";
	path: string;
	initialContent?: string;
	relations?: WorkspaceRelationInput[];
}

export interface CreateWorkspaceItemsOperationInput {
	items: CreateWorkspaceItemOperationInput[];
}

export const createWorkspaceItemsFailureCodes = [
	"cannot_create_root",
	"invalid_initial_content",
	"path_already_exists",
	"path_not_absolute",
	"path_not_canonical",
	"path_not_folder",
	"path_not_found",
	...workspaceRelationFailureCodes,
] as const;

type CreateWorkspaceItemsFailureCode = (typeof createWorkspaceItemsFailureCodes)[number];

export interface CreateWorkspaceItemsFailure {
	code: CreateWorkspaceItemsFailureCode;
	index: number;
	path: string;
}

export interface CreatedWorkspaceItem {
	path: string;
	type: "document" | "folder";
	warnings?: string[];
}

export interface CreateWorkspaceItemsOperationResult {
	items: CreatedWorkspaceItem[];
	failed: CreateWorkspaceItemsFailure[];
}

type CreateWorkspaceItemPathResolution =
	| {
			code: "cannot_create_root" | "path_not_absolute" | "path_not_canonical";
			path: string;
			status: "failed";
	  }
	| {
			name: string;
			parentPath: string;
			path: string;
			status: "ready";
	  };

export async function createWorkspaceItemsOperation(
	accessContext: WorkspaceAccessContext,
	input: CreateWorkspaceItemsOperationInput,
): Promise<CreateWorkspaceItemsOperationResult> {
	const workspaceContext = await getWorkspaceOperationContext({
		access: "mutate",
		context: accessContext,
	});
	const items: CreatedWorkspaceItem[] = [];
	const failed: CreateWorkspaceItemsFailure[] = [];
	const createdItemsByPath = new Map<string, { id: string; type: WorkspaceItemSummary["type"] }>();

	for (const [index, itemInput] of input.items.entries()) {
		const id = crypto.randomUUID();
		const path = resolveCreateWorkspaceItemPath(itemInput.path);

		if (path.status === "failed") {
			failed.push({
				code: path.code,
				index,
				path: itemInput.path,
			});
			continue;
		}

		const parent = resolveCreateWorkspaceItemParent({
			createdItemsByPath,
			parentPath: path.parentPath,
			tree: workspaceContext.tree,
		});

		if (parent.status === "failed") {
			failed.push({
				code: parent.code,
				index,
				path: path.path,
			});
			continue;
		}

		const initialContent = getCreateWorkspaceItemInitialContent(itemInput);

		if (initialContent.status === "failed") {
			failed.push({
				code: initialContent.code,
				index,
				path: path.path,
			});
			continue;
		}

		const relations = resolveWorkspaceRelations({
			createdItemsByPath,
			fromItemId: id,
			relations: itemInput.relations,
			tree: workspaceContext.tree,
		});

		if (relations.status === "failed") {
			failed.push({
				code: relations.failure.code,
				index,
				path: relations.failure.path,
			});
			continue;
		}

		let command: Awaited<ReturnType<WorkspaceKernelClient["createItem"]>>;

		try {
			command = await workspaceContext.kernel.createItem({
				id,
				parentId: parent.parentId,
				type: itemInput.type,
				name: path.name,
				onNameConflict: "error",
				initialContent: initialContent.content,
				actorUserId: accessContext.actor.userId,
				clientMutationId: null,
			});
		} catch (error) {
			if (error instanceof WorkspaceKernelNameConflictError) {
				failed.push({
					code: "path_already_exists",
					index,
					path: path.path,
				});
				continue;
			}

			throw error;
		}

		if (relations.relations.length > 0) {
			await workspaceContext.kernel.createRelations({ relations: relations.relations });
		}

		const createdPath = joinWorkspaceItemPath(parent.path, command.result.name);

		if (createdPath !== path.path) {
			throw new Error(`Workspace create path mismatch: expected ${path.path}, got ${createdPath}`);
		}

		items.push({
			path: createdPath,
			type: itemInput.type,
			...(initialContent.warnings && initialContent.warnings.length > 0
				? { warnings: initialContent.warnings }
				: {}),
		});
		createdItemsByPath.set(createdPath, {
			id: command.result.id,
			type: command.result.type,
		});
	}

	return {
		items,
		failed,
	};
}

function resolveCreateWorkspaceItemParent(input: {
	createdItemsByPath: ReadonlyMap<string, { id: string; type: WorkspaceItemSummary["type"] }>;
	parentPath: string;
	tree: WorkspaceKernelTree;
}):
	| {
			code: "path_not_folder" | "path_not_found";
			status: "failed";
	  }
	| {
			parentId: string | null;
			path: string;
			status: "parent";
	  } {
	if (input.parentPath === "/") {
		return {
			parentId: null,
			path: "/",
			status: "parent",
		};
	}

	const createdParent = input.createdItemsByPath.get(input.parentPath);

	if (createdParent) {
		if (createdParent.type !== "folder") {
			return {
				code: "path_not_folder",
				status: "failed",
			};
		}

		return {
			parentId: createdParent.id,
			path: input.parentPath,
			status: "parent",
		};
	}

	const parent = resolveWorkspaceOperationPath({
		path: input.parentPath,
		tree: input.tree,
	});

	if (parent.status === "invalid_path") {
		throw new Error(`Unexpected invalid create parent path: ${input.parentPath}`);
	}

	if (parent.status === "not_found") {
		return {
			code: "path_not_found",
			status: "failed",
		};
	}

	if (parent.status === "root") {
		throw new Error(`Unexpected root create parent path: ${input.parentPath}`);
	}

	if (parent.item.type !== "folder") {
		return {
			code: "path_not_folder",
			status: "failed",
		};
	}

	return {
		parentId: parent.item.id,
		path: parent.path,
		status: "parent",
	};
}

function resolveCreateWorkspaceItemPath(path: string): CreateWorkspaceItemPathResolution {
	try {
		const normalizedPath = normalizeWorkspacePath(path);

		if (normalizedPath === "/") {
			return {
				code: "cannot_create_root",
				path: normalizedPath,
				status: "failed",
			};
		}

		const parentPath = getParentWorkspacePath(normalizedPath);
		const name = getWorkspacePathName(normalizedPath);
		const canonicalPath = joinWorkspaceItemPath(parentPath, name);

		if (canonicalPath !== normalizedPath) {
			return {
				code: "path_not_canonical",
				path: normalizedPath,
				status: "failed",
			};
		}

		return {
			name,
			parentPath,
			path: canonicalPath,
			status: "ready",
		};
	} catch (error) {
		if (error instanceof WorkspaceKernelPathError && error.code === "path_not_absolute") {
			return {
				code: error.code,
				path,
				status: "failed",
			};
		}

		throw error;
	}
}

function getCreateWorkspaceItemInitialContent(input: CreateWorkspaceItemOperationInput):
	| {
			content?: string;
			status: "ready";
			warnings?: string[];
	  }
	| {
			code: "invalid_initial_content";
			status: "failed";
	  } {
	if (input.type !== "document" || input.initialContent === undefined) {
		return { status: "ready" };
	}

	try {
		const projection = parseMarkdownToTiptapDocumentProjection(input.initialContent);

		return {
			content: stringifyTiptapDocumentJson(projection.document),
			status: "ready",
			...(projection.warnings.length > 0 ? { warnings: projection.warnings } : {}),
		};
	} catch {
		return {
			code: "invalid_initial_content",
			status: "failed",
		};
	}
}
