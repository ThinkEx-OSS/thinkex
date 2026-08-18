import { type WorkspaceItem, isWorkspaceItemContainer } from "#/features/workspaces/contracts";
import type {
	WorkspaceContentReadRequest,
	WorkspaceContentReadResult,
} from "#/features/workspaces/content/workspace-content-contract";
import type {
	DocumentHtmlChunkReadInput,
	DocumentHtmlChunkReadResult,
} from "#/features/workspaces/documents/document-html-chunk";
import type { DocumentAiBlockSnapshot } from "#/features/workspaces/documents/document-ai-html";
import { readWorkspacePageProjection } from "#/features/workspaces/extraction/workspace-page-projection";
import {
	resolveWorkspaceProjectionReadiness,
	type WorkspaceProjectionReadiness,
} from "#/features/workspaces/extraction/workspace-projection-readiness";
import { resolveWorkspaceFileTypeFromItem } from "#/features/workspaces/model/workspace-file";
import { serializeWorkspaceRelations } from "#/features/workspaces/operations/relations";
import {
	getWorkspaceItemPaths,
	listWorkspaceItemRelations,
	resolveWorkspacePaths,
} from "#/features/workspaces/persistence/workspace-items";
import { readWorkspaceFileExtraction } from "#/features/workspaces/persistence/workspace-files";
import { annotateWorkspaceImageDescriptions } from "#/features/workspaces/content/workspace-image-descriptions";
import {
	parseWorkspacePageRange,
	WorkspacePageSelectionError,
} from "#/features/workspaces/read-page-selection";
import {
	createFlashcardRevision,
	type Flashcard,
	serializeFlashcardSetToHtml,
} from "#/features/workspaces/flashcards/flashcard-content";
import {
	parseWorkspaceAddress,
	resolveWorkspaceAddressLocation,
} from "#/features/workspaces/locations/workspace-location";
import {
	summarizeFlashcardStudyProgress,
	type FlashcardStudyState,
} from "#/features/workspaces/flashcards/flashcard-study-state";
import {
	createQuizQuestionRevision,
	serializeQuizSetToHtml,
	type QuizQuestion,
} from "#/features/workspaces/quizzes/quiz-content";
import {
	getQuizAnswer,
	summarizeQuizStudyProgress,
	type QuizStudyState,
} from "#/features/workspaces/quizzes/quiz-study-state";

// A context-sized ceiling for one whole read call, not a transport limit: once
// a call has returned this much content, further requests in it fail fast and
// say to read fewer units at a time.
const maxWorkspaceReadCharacters = 200_000;
const targetEntryChunkCharacters = 48_000;

interface DocumentContentReader {
	readHtmlChunk(input: DocumentHtmlChunkReadInput): Promise<DocumentHtmlChunkReadResult>;
	readBlock(input: {
		blockId: string;
	}): Promise<(DocumentAiBlockSnapshot & { status: "ready" }) | { status: "ref_not_found" }>;
}

type FlashcardItemReader = (
	itemId: string,
) =>
	| { cards: Flashcard[]; studyState: FlashcardStudyState }
	| Promise<{ cards: Flashcard[]; studyState: FlashcardStudyState }>;

type QuizItemReader = (
	itemId: string,
) =>
	| { questions: QuizQuestion[]; studyState: QuizStudyState }
	| Promise<{ questions: QuizQuestion[]; studyState: QuizStudyState }>;

interface PendingReadyResult {
	item: WorkspaceItem;
	read: Extract<WorkspaceContentReadResult, { status: "ready" }>;
	relations: ReturnType<typeof listWorkspaceItemRelations>;
}

export async function readWorkspaceContent(input: {
	bucket: R2Bucket;
	getDocumentSession: (itemId: string) => DocumentContentReader | Promise<DocumentContentReader>;
	readFlashcardItem: FlashcardItemReader;
	readQuizItem: QuizItemReader;
	/** Resolves an item address's refKey to a live item and its path. */
	resolveRefKey: (refKey: string) => Promise<{ item: WorkspaceItem; path: string } | undefined>;
	requests: WorkspaceContentReadRequest[];
	workspaceId: string;
}): Promise<WorkspaceContentReadResult[]> {
	const { requests } = input;
	const pathResolutions = await resolveWorkspacePaths({
		paths: requests.flatMap((request) => ("path" in request ? [request.path] : [])),
		workspaceId: input.workspaceId,
	});
	const results: WorkspaceContentReadResult[] = [];
	const readyResults: PendingReadyResult[] = [];
	let returnedCharacters = 0;
	let pathIndex = 0;

	// Reads stay ordered so each body is consumed before the shared budget advances.
	for (const request of requests) {
		const resolved =
			"path" in request
				? resolvePathRequest(pathResolutions[pathIndex++], request.path)
				: await resolveRefRequest(input.resolveRefKey, request.ref);
		if ("failure" in resolved) {
			results.push(resolved.failure);
			continue;
		}

		if (returnedCharacters >= maxWorkspaceReadCharacters) {
			results.push({
				code: "read_budget_exceeded",
				message: "This call already returned as much as fits. Read fewer units per call.",
				path: resolved.path,
				status: "failed",
			});
			continue;
		}

		try {
			const read = await readWorkspaceItem({
				...input,
				item: resolved.item,
				request,
				path: resolved.path,
			});
			if (read.status !== "ready") {
				results.push(read);
				continue;
			}
			returnedCharacters +=
				"content" in read
					? read.content.length
					: JSON.stringify("cards" in read ? read.cards : read.questions).length;

			readyResults.push({
				item: resolved.item,
				read,
				relations: listWorkspaceItemRelations({
					itemId: resolved.item.id,
					workspaceId: input.workspaceId,
				}),
			});
			results.push(read);
		} catch (error) {
			if (error instanceof WorkspacePageSelectionError) {
				results.push({ code: error.code, path: resolved.path, status: "failed" });
				continue;
			}
			throw error;
		}
	}

	await attachRelationPaths(input.workspaceId, readyResults);
	return results;
}

function resolvePathRequest(
	resolution: Awaited<ReturnType<typeof resolveWorkspacePaths>>[number] | undefined,
	path: string,
): { item: WorkspaceItem; path: string } | { failure: WorkspaceContentReadResult } {
	if (!resolution) {
		throw new Error("Workspace content resolution did not match its request.");
	}
	if (resolution.status === "invalid_path") {
		return { failure: { code: resolution.code, path: resolution.path, status: "failed" } };
	}
	if (resolution.status === "root") {
		return { failure: { code: "path_is_folder", path: resolution.path, status: "failed" } };
	}
	if (resolution.status === "not_found") {
		return { failure: { code: "path_not_found", path: resolution.path, status: "failed" } };
	}
	if (isWorkspaceItemContainer(resolution.item.type)) {
		return { failure: { code: "path_is_folder", path, status: "failed" } };
	}
	return { item: resolution.item, path: resolution.path };
}

async function resolveRefRequest(
	resolveRefKey: (refKey: string) => Promise<{ item: WorkspaceItem; path: string } | undefined>,
	ref: string,
): Promise<{ item: WorkspaceItem; path: string } | { failure: WorkspaceContentReadResult }> {
	const address = parseWorkspaceAddress(ref);
	const resolved = address ? await resolveRefKey(address.refKey) : undefined;
	if (!resolved || isWorkspaceItemContainer(resolved.item.type)) {
		return { failure: { code: "ref_not_found", ref, status: "failed" } };
	}
	return resolved;
}

async function readWorkspaceItem(input: {
	bucket: R2Bucket;
	getDocumentSession: (itemId: string) => DocumentContentReader | Promise<DocumentContentReader>;
	readFlashcardItem: FlashcardItemReader;
	readQuizItem: QuizItemReader;
	item: WorkspaceItem;
	path: string;
	request: WorkspaceContentReadRequest;
	workspaceId: string;
}): Promise<WorkspaceContentReadResult> {
	if (input.request.mode === "ref") {
		return readWorkspaceUnit(input, input.request.ref);
	}
	switch (input.item.type) {
		case "document":
			return readDocument(input);
		case "file":
			return readFile(input);
		case "folder":
			return { code: "unsupported_item_type", path: input.path, status: "failed" };
		case "flashcard":
			return readFlashcards(input);
		case "quiz":
			return readQuiz(input);
	}
}

/** Reads the exact content an address identifies: one page, block, or entry. */
async function readWorkspaceUnit(
	input: Parameters<typeof readWorkspaceItem>[0],
	ref: string,
): Promise<WorkspaceContentReadResult> {
	const address = parseWorkspaceAddress(ref);
	const location = address ? resolveWorkspaceAddressLocation(input.item, address) : undefined;
	if (!location) {
		return { code: "ref_not_found", ref, status: "failed" };
	}

	switch (location.kind) {
		case "item":
			return readWorkspaceItem({ ...input, request: { mode: "start", path: input.path } });
		case "pdf-page":
			return readFile({
				...input,
				request: { mode: "pages", path: input.path, range: String(location.pageNumber) },
			});
		case "document-block":
			return readDocumentBlock(input, location.blockId);
		case "flashcard":
			return readFlashcards(input, location.cardId);
		case "quiz-question":
			return readQuiz(input, location.questionId);
	}
}

async function readFlashcards(
	input: {
		item: WorkspaceItem;
		path: string;
		readFlashcardItem: FlashcardItemReader;
		request: WorkspaceContentReadRequest;
		workspaceId: string;
	},
	targetCardId?: string,
): Promise<WorkspaceContentReadResult> {
	const { cards, studyState } = await input.readFlashcardItem(input.item.id);
	const cardsById = new Map(cards.map((card) => [card.id, card]));
	const selection = selectOrderedEntries({
		entries: serializeFlashcardSetToHtml({ cards, version: 1 }),
		measure: (card) => card.front.length + card.back.length,
		request: input.request,
		targetEntryId: targetCardId,
	});
	if (!selection.ok) {
		return {
			code: selection.code,
			...(selection.message ? { message: selection.message } : {}),
			path: input.path,
			status: "failed",
		};
	}

	return {
		cards: await Promise.all(
			selection.selected.map(async (card) => {
				const source = cardsById.get(card.id);
				if (!source) throw new Error("Serialized flashcard does not match its source set.");
				return {
					ref: `${card.id}.r_${await createFlashcardRevision(source)}`,
					front: await annotateWorkspaceImageDescriptions(card.front, {
						workspaceId: input.workspaceId,
					}),
					back: await annotateWorkspaceImageDescriptions(card.back, {
						workspaceId: input.workspaceId,
					}),
					...(studyState.cards[card.id] ? { study: studyState.cards[card.id] } : {}),
				};
			}),
		),
		format: "html",
		itemId: input.item.id,
		location: {
			kind: "entries",
			returned: selection.returned,
			total: cards.length,
		},
		path: input.path,
		progress: summarizeFlashcardStudyProgress(
			cards.map((card) => card.id),
			studyState,
		),
		ref: input.item.refKey,
		status: "ready",
		type: "flashcard",
	};
}

async function readQuiz(
	input: {
		item: WorkspaceItem;
		path: string;
		readQuizItem: QuizItemReader;
		request: WorkspaceContentReadRequest;
		workspaceId: string;
	},
	targetQuestionId?: string,
): Promise<WorkspaceContentReadResult> {
	const { questions, studyState } = await input.readQuizItem(input.item.id);
	const questionsById = new Map(questions.map((question) => [question.id, question]));
	const selection = selectOrderedEntries({
		entries: serializeQuizSetToHtml({ questions, version: 1 }),
		measure: (question) =>
			question.question.length +
			question.explanation.length +
			question.options.reduce((total, option) => total + option.text.length, 0),
		request: input.request,
		targetEntryId: targetQuestionId,
	});
	if (!selection.ok) {
		return {
			code: selection.code,
			...(selection.message ? { message: selection.message } : {}),
			path: input.path,
			status: "failed",
		};
	}

	return {
		format: "html",
		itemId: input.item.id,
		location: {
			kind: "entries",
			returned: selection.returned,
			total: questions.length,
		},
		path: input.path,
		progress: summarizeQuizStudyProgress(questions, studyState),
		questions: await Promise.all(
			selection.selected.map(async (question) => {
				const source = questionsById.get(question.id);
				if (!source) throw new Error("Serialized quiz question does not match its source set.");
				const answer = getQuizAnswer(source, studyState);
				const selectedIndex = answer
					? source.options.findIndex((option) => option.id === answer.selectedOptionId)
					: -1;
				const annotate = (html: string) =>
					annotateWorkspaceImageDescriptions(html, { workspaceId: input.workspaceId });
				return {
					ref: `${question.id}.r_${await createQuizQuestionRevision(source)}`,
					question: await annotate(question.question),
					options: await Promise.all(
						question.options.map(async ({ text, correct }) => ({
							text: await annotate(text),
							correct,
						})),
					),
					explanation: await annotate(question.explanation),
					...(answer && selectedIndex >= 0
						? {
								answer: {
									selected: selectedIndex + 1,
									correct: answer.selectedOptionId === source.correctOptionId,
								},
							}
						: {}),
				};
			}),
		),
		ref: input.item.refKey,
		status: "ready",
		type: "quiz",
	};
}

type OrderedEntrySelection<T> =
	| { ok: true; selected: T[]; returned: number[] }
	| {
			ok: false;
			code:
				| "invalid_selection"
				| "page_range_out_of_range"
				| "page_selection_too_large"
				| "ref_not_found";
			message?: string;
	  };

/**
 * Shared selection for structured items: one targeted entry from an address,
 * an explicit entry range, or the first character-budgeted chunk on `start`.
 * Every result names the entry numbers it covered, so continuing is just the
 * next range — no cursor to carry.
 */
function selectOrderedEntries<T extends { id: string }>(input: {
	entries: T[];
	measure: (entry: T) => number;
	request: WorkspaceContentReadRequest;
	targetEntryId?: string;
}): OrderedEntrySelection<T> {
	const { entries, request, targetEntryId } = input;

	if (targetEntryId) {
		const entryIndex = entries.findIndex((entry) => entry.id === targetEntryId);
		if (entryIndex < 0) return { ok: false, code: "ref_not_found" };
		return { ok: true, selected: [entries[entryIndex]!], returned: [entryIndex + 1] };
	}
	if (request.mode === "entries") {
		let returned: number[];
		try {
			returned = parseWorkspacePageRange(request.range, entries.length);
		} catch (error) {
			if (error instanceof WorkspacePageSelectionError) {
				return {
					ok: false,
					code: error.code,
					message: `The item has ${entries.length} entries; request up to 20 of them per read.`,
				};
			}
			throw error;
		}
		return {
			ok: true,
			selected: returned.map((entryNumber) => entries[entryNumber - 1]!),
			returned,
		};
	}
	if (request.mode !== "start") {
		return { ok: false, code: "invalid_selection" };
	}

	let characters = 0;
	let endOffset = 0;
	while (endOffset < entries.length) {
		const entryCharacters = input.measure(entries[endOffset]!);
		if (endOffset > 0 && characters + entryCharacters > targetEntryChunkCharacters) break;
		characters += entryCharacters;
		endOffset += 1;
	}

	return {
		ok: true,
		selected: entries.slice(0, endOffset),
		returned: Array.from({ length: endOffset }, (_, index) => index + 1),
	};
}

/**
 * One block of a document in full.
 *
 * Reads elide a widget's source so it does not crowd the prose out of a chunk;
 * this is how the assistant fetches that source before editing it. It works for
 * any block, so a long table or code block can be pulled up on its own too.
 */
async function readDocumentBlock(
	input: {
		getDocumentSession: (itemId: string) => DocumentContentReader | Promise<DocumentContentReader>;
		item: WorkspaceItem;
		path: string;
		workspaceId: string;
	},
	blockId: string,
): Promise<WorkspaceContentReadResult> {
	const documentSession = await input.getDocumentSession(input.item.id);
	const block = await documentSession.readBlock({ blockId });
	if (block.status !== "ready") {
		return { code: "ref_not_found", path: input.path, status: "failed" };
	}

	return {
		content: await annotateWorkspaceImageDescriptions(block.content, {
			workspaceId: input.workspaceId,
		}),
		contentRef: block.contentRef,
		format: "html",
		itemId: input.item.id,
		path: input.path,
		ref: input.item.refKey,
		status: "ready",
		type: "block",
	};
}

async function readDocument(input: {
	getDocumentSession: (itemId: string) => DocumentContentReader | Promise<DocumentContentReader>;
	item: WorkspaceItem;
	path: string;
	request: WorkspaceContentReadRequest;
	workspaceId: string;
}): Promise<WorkspaceContentReadResult> {
	let chunkInput: DocumentHtmlChunkReadInput;
	if (input.request.mode === "start") {
		chunkInput = { offset: 0 };
	} else if (input.request.mode === "entries") {
		// Blocks are contiguous prose; a scattered range has no meaningful join.
		const range = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(input.request.range);
		const startBlock = range ? Number(range[1]) : 0;
		const endBlock = range?.[2] ? Number(range[2]) : startBlock;
		if (!range || startBlock < 1 || endBlock < startBlock) {
			return {
				code: "invalid_selection",
				message: "Document entries must be one block number or one contiguous range like 5-12.",
				path: input.path,
				status: "failed",
			};
		}
		chunkInput = { offset: startBlock - 1, maxBlocks: endBlock - startBlock + 1 };
	} else {
		return { code: "invalid_selection", path: input.path, status: "failed" };
	}

	const documentSession = await input.getDocumentSession(input.item.id);
	const chunk = await documentSession.readHtmlChunk(chunkInput);
	if (chunk.status === "invalid_offset") {
		return { code: "invalid_selection", path: input.path, status: "failed" };
	}

	return {
		content: await annotateWorkspaceImageDescriptions(chunk.content, {
			workspaceId: input.workspaceId,
		}),
		format: "html",
		itemId: input.item.id,
		location: { kind: "blocks", ...chunk.location },
		path: input.path,
		ref: input.item.refKey,
		status: "ready",
		type: "document",
	};
}

async function readFile(input: {
	bucket: R2Bucket;
	item: WorkspaceItem;
	path: string;
	request: WorkspaceContentReadRequest;
	workspaceId: string;
}): Promise<WorkspaceContentReadResult> {
	if (input.request.mode !== "start" && input.request.mode !== "pages") {
		return { code: "invalid_selection", path: input.path, status: "failed" };
	}
	const fileType = resolveWorkspaceFileTypeFromItem(input.item);
	if (!fileType) {
		return { code: "unsupported_item_type", path: input.path, status: "failed" };
	}

	const projection = resolveWorkspaceProjectionReadiness(
		await readWorkspaceFileExtraction({
			itemId: input.item.id,
			workspaceId: input.workspaceId,
		}),
		Date.now(),
	);
	if (projection.state !== "ready") {
		return describeUnreadableProjection(projection, input.path, input.item.id);
	}

	let pageRead: Awaited<ReturnType<typeof readWorkspacePageProjection>>;
	try {
		pageRead = await readWorkspacePageProjection({
			itemId: input.item.id,
			pageCount: projection.pageCount,
			pages: input.request.mode === "pages" ? input.request.range : undefined,
			workspaceId: input.workspaceId,
		});
	} catch (error) {
		if (error instanceof WorkspacePageSelectionError) {
			throw error;
		}
		return { code: "projection_failed", path: input.path, status: "failed", type: "file" };
	}
	return {
		assetKind: fileType.assetKind,
		content: pageRead.content,
		...(pageRead.emptyPages.length > 0 ? { emptyPages: pageRead.emptyPages } : {}),
		format: "markdown",
		itemId: input.item.id,
		location: { kind: "pages", ...pageRead.pages },
		path: input.path,
		...(projection.provisional ? { provisional: true } : {}),
		ref: input.item.refKey,
		status: "ready",
		type: "file",
	};
}

/**
 * Maps a non-ready projection onto the read result the model sees.
 *
 * @param projection - Readiness for a projection that is not serving content.
 * @param path - Absolute workspace path that was read.
 * @returns The pending or failed read result for that path.
 */
function describeUnreadableProjection(
	projection: Exclude<WorkspaceProjectionReadiness, { state: "ready" }>,
	path: string,
	itemId: string,
): WorkspaceContentReadResult {
	if (projection.state === "pending") {
		return {
			elapsedSeconds: projection.elapsedSeconds,
			itemId,
			path,
			phase: projection.phase,
			retryAfterSeconds: projection.retryAfterSeconds,
			status: "pending",
			type: "file",
		};
	}

	if (projection.state === "stalled") {
		return { code: "extraction_stalled", path, status: "failed", type: "file" };
	}

	if (projection.state === "failed") {
		return {
			code: "extraction_failed",
			...(projection.message ? { message: projection.message } : {}),
			path,
			status: "failed",
			type: "file",
		};
	}

	return { code: "projection_failed", path, status: "failed", type: "file" };
}

async function attachRelationPaths(workspaceId: string, readyResults: PendingReadyResult[]) {
	if (readyResults.length === 0) {
		return;
	}
	const resolvedResults = await Promise.all(
		readyResults.map(async ({ relations, ...result }) => ({
			...result,
			relations: await relations,
		})),
	);
	const relatedItemIds = new Set<string>();
	for (const result of resolvedResults) {
		relatedItemIds.add(result.item.id);
		for (const relation of result.relations) {
			relatedItemIds.add(relation.fromItemId);
			relatedItemIds.add(relation.toItemId);
		}
	}
	const itemPaths = await getWorkspaceItemPaths({
		itemIds: Array.from(relatedItemIds),
		workspaceId,
	});
	const pathsByItemId = new Map(itemPaths.map((item) => [item.itemId, item.path]));

	for (const result of resolvedResults) {
		const relations = serializeWorkspaceRelations({
			item: result.item,
			pathsByItemId,
			relations: result.relations,
		});
		if (relations.length > 0) {
			result.read.relations = relations;
		}
	}
}
