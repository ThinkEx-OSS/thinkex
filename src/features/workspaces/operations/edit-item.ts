import { getDocumentSessionFromEnv } from "#/features/workspaces/document-session-access";
import {
	authorizeWorkspaceOperation,
	resolveWorkspaceExistingItemPath,
} from "#/features/workspaces/operations/workspace-operation-context";
import { resolveWorkspacePaths } from "#/features/workspaces/persistence/workspace-items";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import type { DocumentAiEdit } from "#/features/workspaces/documents/document-ai-edits";
import { editWorkspaceItemFailureCodes } from "#/features/workspaces/operations/workspace-operation-failure-codes";
import type { DocumentEditLineChanges } from "#/features/workspaces/documents/document-edit-receipt";
import { resolveDocumentCitations } from "#/features/workspaces/operations/document-citations";
import {
	applyFlashcardEdits,
	type FlashcardEdit,
} from "#/features/workspaces/flashcards/flashcard-edits";
import { updateFlashcardSet } from "#/features/workspaces/flashcards/flashcard-persistence";

type EditWorkspaceItemFailureCode = (typeof editWorkspaceItemFailureCodes)[number];

export type EditWorkspaceItemOperationInput =
	| { edits: DocumentAiEdit[]; path: string; type: "document" }
	| { edits: FlashcardEdit[]; path: string; type: "flashcard" };

interface EditWorkspaceItemFailure {
	code: EditWorkspaceItemFailureCode;
	detail?: string;
	index: number;
}

export interface EditWorkspaceItemOperationResult {
	applied: number;
	failed: EditWorkspaceItemFailure[];
	itemId?: string;
	itemType?: "document" | "flashcard";
	lineChanges?: DocumentEditLineChanges;
	path: string;
}

export async function editWorkspaceItemOperation(
	accessContext: WorkspaceAccessContext,
	input: EditWorkspaceItemOperationInput,
): Promise<EditWorkspaceItemOperationResult> {
	const edits = input.edits;
	await authorizeWorkspaceOperation({
		access: "mutate",
		context: accessContext,
	});
	const failureCount = Math.max(edits.length, 1);
	const [pathResolution] = await resolveWorkspacePaths({
		paths: [input.path],
		workspaceId: accessContext.workspaceId,
	});
	if (!pathResolution) {
		throw new Error("Workspace persistence did not resolve the requested edit path.");
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
	if (resolution.item.type !== input.type) {
		return {
			path: resolution.path,
			...failedWorkspaceEditResult("unsupported_item_type", edits.length),
		};
	}

	if (input.type === "flashcard") {
		const { env } = await import("cloudflare:workers");
		const result = await updateFlashcardSet(
			env,
			{
				actorUserId: accessContext.actor.userId,
				itemId: resolution.item.id,
				workspaceId: accessContext.workspaceId,
			},
			(content) => {
				const applied = applyFlashcardEdits(content, input.edits);
				return { changed: applied.applied > 0, content: applied.content, result: applied };
			},
		);
		return {
			applied: result.applied,
			failed: result.failed,
			itemId: resolution.item.id,
			itemType: "flashcard",
			path: resolution.path,
		};
	}

	const documentSession = await getDocumentSession({
		itemId: resolution.item.id,
		workspaceId: accessContext.workspaceId,
	});

	const result = await documentSession.applyEdits({
		edits: await Promise.all(
			input.edits.map(async (edit) =>
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
		itemType: "document",
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
