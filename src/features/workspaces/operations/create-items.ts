import { authorizeWorkspaceOperation } from "#/features/workspaces/operations/workspace-operation-context";
import {
	createWorkspaceItem,
	resolveWorkspacePaths,
} from "#/features/workspaces/persistence/workspace-items";
import { createWorkspaceItemsFailureCodes } from "#/features/workspaces/operations/workspace-operation-failure-codes";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import type { WorkspacePathResolution } from "#/features/workspaces/persistence/workspace-persistence-types";
import {
	parseDocumentAiHtml,
	WidgetScriptSyntaxError,
} from "#/features/workspaces/documents/document-ai-html";
import { resolveDocumentCitations } from "#/features/workspaces/operations/document-citations";
import { stringifyTiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";
import { isWorkspaceItemContainer } from "#/features/workspaces/contracts";
import {
	createFlashcardSetFromHtml,
	stringifyFlashcardSetContent,
} from "#/features/workspaces/flashcards/flashcard-content";
import {
	createWorkspaceReferenceRecords,
	type WorkspaceReferenceRecord,
} from "#/features/workspaces/locations/workspace-location";
import {
	getParentWorkspacePath,
	getWorkspacePathName,
	joinWorkspaceItemPath,
	normalizeWorkspacePath,
	WorkspacePathError,
} from "#/features/workspaces/model/workspace-paths";

export type CreateWorkspaceItemOperationInput =
	| { type: "folder"; path: string }
	| {
			type: "document";
			path: string;
			initialContent?: string;
	  }
	| {
			type: "flashcard";
			path: string;
			cards: Array<{ front: string; back: string }>;
	  };

export interface CreateWorkspaceItemsOperationInput {
	items: CreateWorkspaceItemOperationInput[];
}

type CreateWorkspaceItemsFailureCode = (typeof createWorkspaceItemsFailureCodes)[number];

export interface CreateWorkspaceItemsFailure {
	code: CreateWorkspaceItemsFailureCode;
	detail?: string;
	index: number;
	path: string;
}

export interface CreatedWorkspaceItem {
	itemId: string;
	path: string;
	type: "document" | "flashcard" | "folder";
}

export interface CreateWorkspaceItemsOperationResult {
	items: CreatedWorkspaceItem[];
	failed: CreateWorkspaceItemsFailure[];
	references: WorkspaceReferenceRecord[];
}

type CreateWorkspaceItemPathResolution =
	| {
			code: "cannot_create_root" | "path_not_absolute";
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
	await authorizeWorkspaceOperation({
		access: "mutate",
		context: accessContext,
	});
	const items: CreatedWorkspaceItem[] = [];
	const failed: CreateWorkspaceItemsFailure[] = [];

	// Preserve order so path resolution observes items committed earlier in this batch.
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

		const [parentResolution] = await resolveWorkspacePaths({
			workspaceId: accessContext.workspaceId,
			paths: [path.parentPath],
		});
		if (!parentResolution) {
			throw new Error("Workspace persistence did not resolve the requested create parent.");
		}
		const parent = resolveCreateWorkspaceItemParent(parentResolution);

		if (parent.status === "failed") {
			failed.push({
				code: parent.code,
				index,
				path: path.path,
			});
			continue;
		}

		const initialContent = getCreateWorkspaceItemInitialContent(
			itemInput.type === "document" && itemInput.initialContent !== undefined
				? {
						...itemInput,
						initialContent: await resolveDocumentCitations({
							context: accessContext,
							html: itemInput.initialContent,
						}),
					}
				: itemInput,
		);

		if (initialContent.status === "failed") {
			failed.push({
				code: initialContent.code,
				...(initialContent.detail ? { detail: initialContent.detail } : {}),
				index,
				path: path.path,
			});
			continue;
		}

		const { env } = await import("cloudflare:workers");
		const outcome = await createWorkspaceItem(env, {
			id,
			workspaceId: accessContext.workspaceId,
			parentId: parent.parentId,
			type: itemInput.type,
			name: path.name,
			onNameConflict: "error",
			initialContent: initialContent.content,
			actorUserId: accessContext.actor.userId,
		});

		if (outcome.status === "conflict") {
			failed.push({
				code: "path_already_exists",
				index,
				path: path.path,
			});
			continue;
		}

		const command = outcome.command;

		const createdPath = joinWorkspaceItemPath(parent.path, command.result.name);

		if (createdPath !== path.path) {
			throw new Error(`Workspace create path mismatch: expected ${path.path}, got ${createdPath}`);
		}

		items.push({
			itemId: id,
			path: createdPath,
			type: itemInput.type,
		});
	}

	return {
		items,
		failed,
		references: createWorkspaceReferenceRecords(
			items.map((item) => ({ itemId: item.itemId, kind: "item", version: 1 })),
		),
	};
}

function resolveCreateWorkspaceItemParent(resolution: WorkspacePathResolution):
	| {
			code: "path_not_folder" | "path_not_found";
			status: "failed";
	  }
	| {
			parentId: string | null;
			path: string;
			status: "parent";
	  } {
	if (resolution.status === "root") {
		return {
			parentId: null,
			path: resolution.path,
			status: "parent",
		};
	}

	if (resolution.status === "invalid_path") {
		throw new Error(`Unexpected invalid create parent path: ${resolution.path}`);
	}

	if (resolution.status === "not_found") {
		return {
			code: "path_not_found",
			status: "failed",
		};
	}

	if (!isWorkspaceItemContainer(resolution.item.type)) {
		return {
			code: "path_not_folder",
			status: "failed",
		};
	}

	return {
		parentId: resolution.item.id,
		path: resolution.path,
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

		return {
			name,
			parentPath,
			path: canonicalPath,
			status: "ready",
		};
	} catch (error) {
		if (error instanceof WorkspacePathError && error.code === "path_not_absolute") {
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
	  }
	| {
			code: "invalid_initial_content" | "widget_script_syntax_error";
			detail?: string;
			status: "failed";
	  } {
	if (input.type === "flashcard") {
		try {
			return {
				content: stringifyFlashcardSetContent(createFlashcardSetFromHtml(input.cards)),
				status: "ready",
			};
		} catch (error) {
			return {
				code: "invalid_initial_content",
				...(error instanceof Error && error.message ? { detail: error.message } : {}),
				status: "failed",
			};
		}
	}

	if (input.type !== "document" || input.initialContent === undefined) {
		return { status: "ready" };
	}

	try {
		return {
			content: stringifyTiptapDocumentJson(parseDocumentAiHtml(input.initialContent)),
			status: "ready",
		};
	} catch (error) {
		return {
			code:
				error instanceof WidgetScriptSyntaxError
					? "widget_script_syntax_error"
					: "invalid_initial_content",
			...(error instanceof WidgetScriptSyntaxError ? { detail: error.message } : {}),
			status: "failed",
		};
	}
}
