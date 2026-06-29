import {
	getWorkspaceKernelAiPageContext,
	resolveWorkspaceKernelAiPath,
} from "#/features/workspaces/ai/workspace-kernel-ai-common";
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

export interface CreateWorkspaceKernelAiItemInput {
	type: "document" | "folder";
	path: string;
	initialContent?: string;
}

export interface CreateWorkspaceKernelAiItemsInput {
	items: CreateWorkspaceKernelAiItemInput[];
	userId: string;
	workspaceId: string;
}

export interface CreateWorkspaceKernelAiFailure {
	code: CreateWorkspaceKernelAiFailureCode;
	index: number;
	path: string;
}

export interface CreateWorkspaceKernelAiCreatedItem {
	path: string;
	type: "document" | "folder";
	warnings?: string[];
}

export interface CreateWorkspaceKernelAiItemsResult {
	items: CreateWorkspaceKernelAiCreatedItem[];
	failed: CreateWorkspaceKernelAiFailure[];
}

type WorkspaceKernelAiCreatePathResolution =
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

type CreateWorkspaceKernelAiFailureCode =
	| "cannot_create_root"
	| "invalid_initial_content"
	| "path_already_exists"
	| "path_not_absolute"
	| "path_not_canonical"
	| "path_not_folder"
	| "path_not_found";

export async function createWorkspaceKernelAiItems(
	input: CreateWorkspaceKernelAiItemsInput,
): Promise<CreateWorkspaceKernelAiItemsResult> {
	const context = await getWorkspaceKernelAiPageContext({
		access: "mutate",
		userId: input.userId,
		workspaceId: input.workspaceId,
	});
	const items: CreateWorkspaceKernelAiCreatedItem[] = [];
	const failed: CreateWorkspaceKernelAiFailure[] = [];
	const createdItemsByPath = new Map<string, { id: string; type: WorkspaceItemSummary["type"] }>();

	for (const [index, itemInput] of input.items.entries()) {
		const path = resolveWorkspaceKernelAiCreatePath(itemInput.path);

		if (path.status === "failed") {
			failed.push({
				code: path.code,
				index,
				path: itemInput.path,
			});
			continue;
		}

		const parent = resolveWorkspaceKernelAiCreateParent({
			createdItemsByPath,
			parentPath: path.parentPath,
			tree: context.tree,
		});

		if (parent.status === "failed") {
			failed.push({
				code: parent.code,
				index,
				path: path.path,
			});
			continue;
		}

		const initialContent = getWorkspaceKernelAiCreateInitialContent(itemInput);

		if (initialContent.status === "failed") {
			failed.push({
				code: initialContent.code,
				index,
				path: path.path,
			});
			continue;
		}

		let command: Awaited<ReturnType<WorkspaceKernelClient["createItem"]>>;

		try {
			command = await context.kernel.createItem({
				parentId: parent.parentId,
				type: itemInput.type,
				name: path.name,
				onNameConflict: "error",
				initialContent: initialContent.content,
				actorUserId: input.userId,
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

function resolveWorkspaceKernelAiCreateParent(input: {
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

	const parent = resolveWorkspaceKernelAiPath({
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

function resolveWorkspaceKernelAiCreatePath(path: string): WorkspaceKernelAiCreatePathResolution {
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

function getWorkspaceKernelAiCreateInitialContent(input: CreateWorkspaceKernelAiItemInput):
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
