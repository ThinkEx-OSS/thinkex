import { getDocumentSessionFromEnv } from "#/features/workspaces/document-session-access";
import { retryOnTransientDocumentSessionReset } from "#/features/workspaces/documents/document-session-transient";
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
	type FlashcardEditTarget,
} from "#/features/workspaces/flashcards/flashcard-edits";
import { updateFlashcardSet } from "#/features/workspaces/flashcards/flashcard-persistence";
import {
	indexWorkspaceReferenceRecords,
	parseWorkspaceReference,
	type WorkspaceReferenceRecord,
} from "#/features/workspaces/locations/workspace-location";

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
		const targets = await resolveEditTargets<FlashcardEdit, FlashcardEditTarget>(
			accessContext,
			input.edits,
			(record) =>
				record.location.kind === "flashcard" &&
				record.location.itemId === resolution.item.id &&
				record.revision
					? { cardId: record.location.cardId, revision: record.revision }
					: undefined,
		);
		const { env } = await import("cloudflare:workers");
		const result = await updateFlashcardSet(
			env,
			{
				actorUserId: accessContext.actor.userId,
				itemId: resolution.item.id,
				workspaceId: accessContext.workspaceId,
			},
			async (content) => {
				const applied = await applyFlashcardEdits(content, input.edits, targets);
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
	const targets = await resolveEditTargets(accessContext, input.edits, (record) =>
		record.location.kind === "document-block" &&
		record.location.itemId === resolution.item.id &&
		record.revision
			? `${record.location.blockId}.r_${record.revision}`
			: undefined,
	);
	const resolvedEdits: DocumentAiEdit[] = await Promise.all(
		input.edits.map(async (edit) => {
			const contentEdit = replacePublicRefs(edit, targets);
			return "html" in contentEdit
				? {
						...contentEdit,
						html: await resolveDocumentCitations({
							context: accessContext,
							html: contentEdit.html,
						}),
					}
				: contentEdit;
		}),
	);

	// A reset object drops the turn, not the persisted document, so a fresh stub
	// replays the edit; the operation id keeps the replay from applying twice.
	const result = await retryOnTransientDocumentSessionReset(async () => {
		const documentSession = await getDocumentSession({
			itemId: resolution.item.id,
			workspaceId: accessContext.workspaceId,
		});
		return documentSession.applyEdits({
			edits: resolvedEdits,
			operationId: accessContext.operationId,
		});
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

async function resolveEditTargets<
	TEdit extends { ref: string; afterRef?: string; beforeRef?: string },
	TTarget,
>(
	context: WorkspaceAccessContext,
	edits: readonly TEdit[],
	toTarget: (record: WorkspaceReferenceRecord) => TTarget | undefined,
) {
	const refs = [...new Set(edits.flatMap(getReferencedRefs))];
	const records =
		refs.length > 0 && context.resolveWorkspaceReferences
			? await context.resolveWorkspaceReferences(refs)
			: [];
	const recordsByRef = indexWorkspaceReferenceRecords(records);
	const targets = new Map<string, TTarget>();
	for (const ref of refs) {
		const parsedRef = parseWorkspaceReference(ref);
		const record = parsedRef ? recordsByRef.get(parsedRef) : undefined;
		const target = record ? toTarget(record) : undefined;
		if (target) targets.set(ref, target);
	}

	return targets;
}

function replacePublicRefs<TEdit extends { ref: string; afterRef?: string; beforeRef?: string }>(
	edit: TEdit,
	targets: ReadonlyMap<string, string>,
): TEdit {
	// Unresolved refs stay invalid so the document engine reports them at their original edit index.
	return {
		...edit,
		ref: targets.get(edit.ref) ?? edit.ref,
		...(edit.beforeRef ? { beforeRef: targets.get(edit.beforeRef) ?? edit.beforeRef } : {}),
		...(edit.afterRef ? { afterRef: targets.get(edit.afterRef) ?? edit.afterRef } : {}),
	};
}

function getReferencedRefs(edit: { ref: string; afterRef?: string; beforeRef?: string }) {
	return [
		edit.ref,
		...(edit.beforeRef ? [edit.beforeRef] : []),
		...(edit.afterRef ? [edit.afterRef] : []),
	];
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
