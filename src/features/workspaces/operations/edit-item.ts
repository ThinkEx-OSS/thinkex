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
		const resolved = await resolveEditTargets<FlashcardEdit, FlashcardEditTarget>(
			accessContext,
			input.edits,
			(record) =>
				record.location.kind === "flashcard" &&
				record.location.itemId === resolution.item.id &&
				record.revision
					? { cardId: record.location.cardId, revision: record.revision }
					: undefined,
		);
		if (resolved.edits.length === 0) {
			return {
				applied: 0,
				failed: resolved.failures,
				itemId: resolution.item.id,
				itemType: "flashcard",
				path: resolution.path,
			};
		}
		const { env } = await import("cloudflare:workers");
		const result = await updateFlashcardSet(
			env,
			{
				actorUserId: accessContext.actor.userId,
				itemId: resolution.item.id,
				workspaceId: accessContext.workspaceId,
			},
			async (content) => {
				const applied = await applyFlashcardEdits(content, resolved.edits, resolved.targets);
				return { changed: applied.applied > 0, content: applied.content, result: applied };
			},
		);
		return {
			applied: result.applied,
			failed: mergeResolvedEditFailures(resolved, result.failed),
			itemId: resolution.item.id,
			itemType: "flashcard",
			path: resolution.path,
		};
	}
	const resolved = await resolveEditTargets(accessContext, input.edits, (record) =>
		record.location.kind === "document-block" &&
		record.location.itemId === resolution.item.id &&
		record.revision
			? `${record.location.blockId}.r_${record.revision}`
			: undefined,
	);
	if (resolved.edits.length === 0) {
		return {
			applied: 0,
			failed: resolved.failures,
			itemId: resolution.item.id,
			itemType: "document",
			path: resolution.path,
		};
	}

	const documentSession = await getDocumentSession({
		itemId: resolution.item.id,
		workspaceId: accessContext.workspaceId,
	});

	const result = await documentSession.applyEdits({
		edits: await Promise.all(
			resolved.edits.map(async (edit) => {
				const contentEdit = replacePublicRefs(edit, resolved.targets);
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
		),
		operationId: accessContext.operationId,
	});

	return {
		applied: result.applied,
		failed: mergeResolvedEditFailures(resolved, result.failures),
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
	toTarget: (
		record: WorkspaceReferenceRecord,
	) => TTarget | undefined | Promise<TTarget | undefined>,
) {
	const refs = [...new Set(edits.flatMap(getReferencedRefs))];
	const records =
		refs.length > 0 && context.resolveWorkspaceReferences
			? await context.resolveWorkspaceReferences(refs)
			: [];
	const recordsByRef = indexWorkspaceReferenceRecords(records);
	const resolvedEdits: TEdit[] = [];
	const targets = new Map<string, TTarget>();
	const originalIndexes: number[] = [];
	const failures: EditWorkspaceItemFailure[] = [];

	for (const [index, edit] of edits.entries()) {
		const editTargets = new Map<string, TTarget>();
		for (const ref of getReferencedRefs(edit)) {
			const parsedRef = parseWorkspaceReference(ref);
			const record = parsedRef ? recordsByRef.get(parsedRef) : undefined;
			const target = record ? await toTarget(record) : undefined;
			if (!target) break;
			editTargets.set(ref, target);
		}
		if (editTargets.size !== getReferencedRefs(edit).length) {
			failures.push({ code: "ref_not_found", index });
			continue;
		}

		for (const [ref, target] of editTargets) targets.set(ref, target);
		resolvedEdits.push(edit);
		originalIndexes.push(index);
	}

	return { edits: resolvedEdits, failures, originalIndexes, targets };
}

function replacePublicRefs<TEdit extends { ref: string; afterRef?: string; beforeRef?: string }>(
	edit: TEdit,
	targets: ReadonlyMap<string, string>,
): TEdit {
	return {
		...edit,
		ref: targets.get(edit.ref)!,
		...(edit.beforeRef ? { beforeRef: targets.get(edit.beforeRef)! } : {}),
		...(edit.afterRef ? { afterRef: targets.get(edit.afterRef)! } : {}),
	};
}

function getReferencedRefs(edit: { ref: string; afterRef?: string; beforeRef?: string }) {
	return [
		edit.ref,
		...(edit.beforeRef ? [edit.beforeRef] : []),
		...(edit.afterRef ? [edit.afterRef] : []),
	];
}

function mergeResolvedEditFailures(
	resolved: { failures: EditWorkspaceItemFailure[]; originalIndexes: number[] },
	operationFailures: readonly EditWorkspaceItemFailure[],
) {
	return [
		...resolved.failures,
		...operationFailures.map((failure) => ({
			...failure,
			index: resolved.originalIndexes[failure.index] ?? failure.index,
		})),
	].sort((left, right) => left.index - right.index);
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
