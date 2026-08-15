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
import { applyQuizEdits, type QuizEdit } from "#/features/workspaces/quizzes/quiz-edits";
import { updateQuizSet } from "#/features/workspaces/quizzes/quiz-persistence";
import type { OrderedEntryEditTarget } from "#/features/workspaces/content/ordered-entry-edits";
import {
	parseWorkspaceUnitRef,
	workspaceEntryIdSchema,
} from "#/features/workspaces/locations/workspace-location";

type EditWorkspaceItemFailureCode = (typeof editWorkspaceItemFailureCodes)[number];

export type EditWorkspaceItemOperationInput =
	| { edits: DocumentAiEdit[]; path: string; type: "document" }
	| { edits: FlashcardEdit[]; path: string; type: "flashcard" }
	| { edits: QuizEdit[]; path: string; type: "quiz" };

interface EditWorkspaceItemFailure {
	code: EditWorkspaceItemFailureCode;
	detail?: string;
	index: number;
}

export interface EditWorkspaceItemOperationResult {
	applied: number;
	failed: EditWorkspaceItemFailure[];
	itemId?: string;
	itemType?: "document" | "flashcard" | "quiz";
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

	if (input.type === "flashcard" || input.type === "quiz") {
		const itemId = resolution.item.id;
		const targets = collectEntryEditTargets(input.edits);
		const { env } = await import("cloudflare:workers");
		const persistenceInput = {
			actorUserId: accessContext.actor.userId,
			itemId,
			workspaceId: accessContext.workspaceId,
		};
		const result =
			input.type === "flashcard"
				? await updateFlashcardSet(env, persistenceInput, async (content) => {
						const applied = await applyFlashcardEdits(content, input.edits, targets);
						return { changed: applied.applied > 0, content: applied.content, result: applied };
					})
				: await updateQuizSet(env, persistenceInput, async (content) => {
						const applied = await applyQuizEdits(content, input.edits, targets);
						return { changed: applied.applied > 0, content: applied.content, result: applied };
					});
		return {
			applied: result.applied,
			failed: result.failed,
			itemId,
			itemType: input.type,
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

/**
 * Parses every entry ref an edit batch mentions. A unit ref is self-contained
 * — entry id plus content revision — so targeting needs no lookup; a ref whose
 * unit is not an entry id simply resolves to nothing and the edit engine
 * reports `ref_not_found` at the right index.
 */
function collectEntryEditTargets(
	edits: readonly { ref: string; afterRef?: string; beforeRef?: string }[],
) {
	const targets = new Map<string, OrderedEntryEditTarget>();
	for (const edit of edits) {
		for (const ref of [edit.ref, edit.beforeRef, edit.afterRef]) {
			if (!ref || targets.has(ref)) continue;
			const parsed = parseWorkspaceUnitRef(ref);
			if (!parsed || !workspaceEntryIdSchema.safeParse(parsed.unit).success) continue;
			targets.set(ref, { entryId: parsed.unit, revision: parsed.revision });
		}
	}
	return targets;
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
