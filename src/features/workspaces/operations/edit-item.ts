import { getDocumentSessionFromEnv } from "#/features/workspaces/document-session-access";
import {
	getWorkspaceOperationContext,
	resolveWorkspaceExistingItemPath,
} from "#/features/workspaces/operations/workspace-operation-context";
import {
	resolveWorkspaceRelations,
	type WorkspaceRelationInput,
	workspaceRelationFailureCodes,
} from "#/features/workspaces/operations/relations";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import {
	type DocumentMarkdownEdit,
	documentMarkdownEditFailureCodes,
} from "#/features/workspaces/documents/document-markdown-edits";

export const editWorkspaceItemFailureCodes = [
	"cannot_edit_root",
	"missing_edit_operation",
	"path_not_absolute",
	"path_not_found",
	...workspaceRelationFailureCodes,
	"unsupported_item_type",
	...documentMarkdownEditFailureCodes,
	"invalid_document_projection",
] as const;

type EditWorkspaceItemFailureCode = (typeof editWorkspaceItemFailureCodes)[number];

export interface EditWorkspaceItemOperationInput {
	edits?: DocumentMarkdownEdit[];
	path: string;
	relations?: WorkspaceRelationInput[];
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
	const edits = input.edits ?? [];

	if (edits.length === 0 && (input.relations?.length ?? 0) === 0) {
		return {
			path: input.path,
			warnings: [],
			...failedWorkspaceEditResult("missing_edit_operation", 1),
		};
	}

	const workspaceContext = await getWorkspaceOperationContext({
		access: "mutate",
		context: accessContext,
	});
	const failureCount = Math.max(edits.length, 1);
	const resolution = resolveWorkspaceExistingItemPath({
		path: input.path,
		rootFailureCode: "cannot_edit_root",
		tree: workspaceContext.tree,
	});

	if (resolution.status === "failed") {
		return {
			path: resolution.failure.path,
			warnings: [],
			...failedWorkspaceEditResult(resolution.failure.code, failureCount),
		};
	}

	const relations = resolveWorkspaceRelations({
		excludeItemId: resolution.item.id,
		fromItemId: resolution.item.id,
		relations: input.relations,
		tree: workspaceContext.tree,
	});

	if (relations.status === "failed") {
		return {
			path: relations.failure.path,
			warnings: [],
			...failedWorkspaceEditResult(relations.failure.code, failureCount),
		};
	}

	if (edits.length === 0) {
		if (relations.relations.length > 0) {
			await workspaceContext.kernel.createRelations({ relations: relations.relations });
		}

		return {
			applied: 0,
			failed: [],
			path: resolution.path,
			warnings: [],
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

	if (result.failures.length === 0 && relations.relations.length > 0) {
		await workspaceContext.kernel.createRelations({ relations: relations.relations });
	}

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
