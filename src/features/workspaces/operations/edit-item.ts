import { getDocumentSessionFromEnv } from "#/features/workspaces/document-session-access";
import {
	getAuthorizedWorkspaceKernel,
	resolveWorkspaceExistingItemPath,
} from "#/features/workspaces/operations/workspace-operation-context";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import { type DocumentAiEdit } from "#/features/workspaces/documents/document-ai-edits";
import { editWorkspaceItemFailureCodes } from "#/features/workspaces/operations/workspace-operation-failure-codes";
import type { DocumentEditLineChanges } from "#/features/workspaces/documents/document-edit-receipt";
import { resolveDocumentCitations } from "#/features/workspaces/operations/document-citations";
import { getWorkspaceItemContentKind } from "#/features/workspaces/contracts";

type EditWorkspaceItemFailureCode = (typeof editWorkspaceItemFailureCodes)[number];

export interface EditWorkspaceItemOperationInput {
	edits: DocumentAiEdit[];
	path: string;
}

interface EditWorkspaceItemFailure {
	code: EditWorkspaceItemFailureCode;
	detail?: string;
	index: number;
}

export interface EditWorkspaceItemOperationResult {
	applied: number;
	failed: EditWorkspaceItemFailure[];
	itemId?: string;
	lineChanges?: DocumentEditLineChanges;
	path: string;
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
			...failedWorkspaceEditResult(resolution.failure.code, failureCount),
		};
	}

	if (getWorkspaceItemContentKind(resolution.item.type) !== "document") {
		return {
			path: resolution.path,
			...failedWorkspaceEditResult("unsupported_item_type", edits.length),
		};
	}

	const documentSession = await getDocumentSession({
		itemId: resolution.item.id,
		workspaceId: accessContext.workspaceId,
	});

	const result = await documentSession.applyEdits({
		edits: await Promise.all(
			edits.map(async (edit) =>
				"html" in edit
					? {
							...edit,
							html: await resolveDocumentCitations({
								context: accessContext,
								html: edit.html,
							}),
						}
					: edit,
			),
		),
		operationId: accessContext.operationId,
	});

	return {
		applied: result.applied,
		failed: result.failures,
		itemId: resolution.item.id,
		...(result.lineChanges ? { lineChanges: result.lineChanges } : {}),
		path: resolution.path,
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
