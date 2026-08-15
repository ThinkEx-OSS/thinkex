import type { ReplaceUniqueTextFailureCode } from "#/features/workspaces/content/replace-unique-text";

/**
 * The shared edit engine for structured items that are ordered lists of
 * entries — flashcard sets (cards) and quizzes (questions). It owns ref
 * resolution, revision staleness, ordering mechanics, and per-edit failure
 * collection; the item type supplies how one entry is built or revised.
 */

export type OrderedEntryEditOp =
	| "insert_before"
	| "insert_after"
	| "update"
	| "replace"
	| "replace_text"
	| "move"
	| "delete";

export interface OrderedEntryEditShape {
	op: OrderedEntryEditOp;
	ref: string;
	beforeRef?: string;
	afterRef?: string;
}

export interface OrderedEntryEditTarget {
	entryId: string;
	revision: string;
}

export type OrderedEntryEditFailureCode =
	| "cannot_delete_last_entry"
	| "ref_not_found"
	| "ref_stale"
	| "invalid_entry_content"
	| "no_change"
	| ReplaceUniqueTextFailureCode;

export interface OrderedEntryEditFailure {
	code: OrderedEntryEditFailureCode;
	detail?: string;
	index: number;
}

export class OrderedEntryEditError extends Error {
	constructor(
		readonly code: Exclude<OrderedEntryEditFailureCode, "invalid_entry_content">,
		message?: string,
	) {
		super(message);
	}
}

export async function applyOrderedEntryEdits<
	TEntry extends { id: string },
	TEdit extends OrderedEntryEditShape,
>(input: {
	entries: readonly TEntry[];
	edits: readonly TEdit[];
	targets: ReadonlyMap<string, OrderedEntryEditTarget>;
	computeRevision: (entry: TEntry) => Promise<string>;
	/** Builds the entry an insert op adds. Throw for invalid content. */
	createEntry: (edit: TEdit) => TEntry;
	/** Returns the revised entry for update, replace, and replace_text ops. */
	reviseEntry: (entry: TEntry, edit: TEdit) => TEntry;
	/** Shown when a delete would empty the item, e.g. "A quiz needs at least one question." */
	lastEntryDetail: string;
}): Promise<{ applied: number; failed: OrderedEntryEditFailure[]; entries: TEntry[] }> {
	const entries = [...input.entries];
	// Revisions are pinned to the pre-edit content so every ref a read handed
	// out stays usable for the whole batch, even after an earlier edit touched
	// the same entry.
	const initialRevisions = new Map(
		await Promise.all(
			entries.map(async (entry) => [entry.id, await input.computeRevision(entry)] as const),
		),
	);
	const failed: OrderedEntryEditFailure[] = [];
	let applied = 0;

	const findEntryIndex = (ref: string) => {
		const target = input.targets.get(ref);
		if (!target) throw new OrderedEntryEditError("ref_not_found");
		const index = entries.findIndex((entry) => entry.id === target.entryId);
		if (index < 0) throw new OrderedEntryEditError("ref_not_found");
		if (initialRevisions.get(target.entryId) !== target.revision) {
			throw new OrderedEntryEditError("ref_stale");
		}
		return index;
	};

	for (const [index, edit] of input.edits.entries()) {
		try {
			const before = JSON.stringify(entries);
			const entryIndex = findEntryIndex(edit.ref);
			if (edit.op === "insert_before" || edit.op === "insert_after") {
				const insertionIndex = edit.op === "insert_before" ? entryIndex : entryIndex + 1;
				entries.splice(insertionIndex, 0, input.createEntry(edit));
			} else if (edit.op === "update" || edit.op === "replace" || edit.op === "replace_text") {
				entries[entryIndex] = input.reviseEntry(entries[entryIndex]!, edit);
			} else if (edit.op === "delete") {
				if (entries.length === 1) {
					throw new OrderedEntryEditError("cannot_delete_last_entry", input.lastEntryDetail);
				}
				entries.splice(entryIndex, 1);
			} else if (edit.op === "move") {
				const destinationRef = edit.beforeRef ?? edit.afterRef;
				if (!destinationRef || destinationRef === edit.ref) {
					throw new OrderedEntryEditError("no_change");
				}
				findEntryIndex(destinationRef);
				const [entry] = entries.splice(entryIndex, 1);
				const destinationIndex = findEntryIndex(destinationRef);
				if (!entry) throw new OrderedEntryEditError("ref_not_found");
				entries.splice(edit.beforeRef ? destinationIndex : destinationIndex + 1, 0, entry);
			} else {
				throw new Error("Unsupported edit.");
			}
			if (JSON.stringify(entries) === before) throw new OrderedEntryEditError("no_change");
			applied += 1;
		} catch (error) {
			failed.push({
				code: error instanceof OrderedEntryEditError ? error.code : "invalid_entry_content",
				...(error instanceof Error && error.message ? { detail: error.message } : {}),
				index,
			});
		}
	}

	return { applied, failed, entries };
}
