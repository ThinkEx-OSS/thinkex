import { getDocumentSessionFromEnv } from "#/features/workspaces/document-session-access";
import {
	getAuthorizedWorkspaceKernel,
	resolveWorkspaceExistingItemPath,
} from "#/features/workspaces/operations/workspace-operation-context";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import {
	type DocumentMarkdownEdit,
	documentMarkdownEditFailureCodes,
} from "#/features/workspaces/documents/document-markdown-edits";

export const editWorkspaceItemFailureCodes = [
	"cannot_edit_root",
	"path_not_absolute",
	"path_not_found",
	"unsupported_item_type",
	...documentMarkdownEditFailureCodes,
	"invalid_document_projection",
] as const;

type EditWorkspaceItemFailureCode = (typeof editWorkspaceItemFailureCodes)[number];

export interface EditWorkspaceItemOperationInput {
	edits: DocumentMarkdownEdit[];
	path: string;
}

interface EditWorkspaceItemFailure {
	code: EditWorkspaceItemFailureCode;
	index: number;
}

export interface EditWorkspaceItemOperationResult {
	applied: number;
	failed: EditWorkspaceItemFailure[];
	path: string;
	warnings: string[];
}

export async function editWorkspaceItemOperation(
	accessContext: WorkspaceAccessContext,
	input: EditWorkspaceItemOperationInput,
): Promise<EditWorkspaceItemOperationResult> {
	const edits = input.edits;
	const kernel = await getAuthorizedWorkspaceKernel({
		access: "mutate",
		context: accessContext,
	});
	const failureCount = Math.max(edits.length, 1);
	const [pathResolution] = await kernel.resolvePaths({ paths: [input.path] });
	if (!pathResolution) {
		throw new Error("Workspace kernel did not resolve the requested edit path.");
	}
	const resolution = resolveWorkspaceExistingItemPath({
		resolution: pathResolution,
		rootFailureCode: "cannot_edit_root",
	});

	if (resolution.status === "failed") {
		return {
			path: resolution.failure.path,
			warnings: [],
			...failedWorkspaceEditResult(resolution.failure.code, failureCount),
		};
	}

	if (resolution.item.type !== "document") {
		return {
			path: resolution.path,
			warnings: [],
			...failedWorkspaceEditResult("unsupported_item_type", edits.length),
		};
	}

	const documentSession = await getDocumentSession({
		itemId: resolution.item.id,
		workspaceId: accessContext.workspaceId,
	});

	const result = await documentSession.applyMarkdownEdits({
		edits,
	});

	return {
		applied: result.applied,
		failed: result.failures,
		path: resolution.path,
		warnings: result.warnings,
	};
}

async function getDocumentSession(input: { itemId: string; workspaceId: string }) {
	const { env } = await import("cloudflare:workers");

	return getDocumentSessionFromEnv(env, input);
}

function failedWorkspaceEditResult(
	code: EditWorkspaceItemFailureCode,
	editCount: number,
): Pick<EditWorkspaceItemOperationResult, "applied" | "failed"> {
	return {
		applied: 0,
		failed: Array.from({ length: editCount }, (_, index) => ({
			code,
			index,
		})),
	};
}
