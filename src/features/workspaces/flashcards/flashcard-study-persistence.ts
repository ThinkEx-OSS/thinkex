import { and, eq } from "drizzle-orm";

import { workspaceItemContents, workspaceItems, workspaceItemUserStates } from "#/db/schema";
import { withDb } from "#/db/server";
import { parseFlashcardSetContent } from "#/features/workspaces/flashcards/flashcard-content";
import {
	applyFlashcardStudyRating,
	createEmptyFlashcardStudyState,
	parseFlashcardStudyState,
	type FlashcardStudyRating,
} from "#/features/workspaces/flashcards/flashcard-study-state";
import { assertCanReadWorkspace } from "#/features/workspaces/server/permissions";
import type { Transaction } from "#/features/workspaces/persistence/workspace-postgres-support";

export async function readFlashcardViewer(input: {
	itemId: string;
	userId: string;
	workspaceId: string;
}) {
	return await withDb(async (db) => {
		await assertCanReadWorkspace(db, input);
		const [row] = await db
			.select({ content: workspaceItemContents.content, state: workspaceItemUserStates.state })
			.from(workspaceItems)
			.innerJoin(workspaceItemContents, eq(workspaceItems.id, workspaceItemContents.itemId))
			.leftJoin(
				workspaceItemUserStates,
				and(
					eq(workspaceItemUserStates.itemId, workspaceItems.id),
					eq(workspaceItemUserStates.userId, input.userId),
				),
			)
			.where(
				and(
					eq(workspaceItems.id, input.itemId),
					eq(workspaceItems.workspaceId, input.workspaceId),
					eq(workspaceItems.type, "flashcard"),
				),
			)
			.limit(1);
		if (!row) throw new Error("Flashcard set not found.");
		return {
			cards: parseFlashcardSetContent(row.content).cards,
			studyState: parseFlashcardStudyState(row.state),
		};
	});
}

export async function recordFlashcardStudyRating(input: {
	cardId: string;
	itemId: string;
	rating: FlashcardStudyRating;
	userId: string;
	workspaceId: string;
}) {
	return await withDb((db) =>
		db.transaction(async (transaction) => {
			const cards = await requireFlashcardSet(transaction, input);
			if (!cards.some((card) => card.id === input.cardId)) {
				throw new Error("Flashcard not found.");
			}

			const state = await lockFlashcardStudyState(transaction, input);
			const nextState = applyFlashcardStudyRating(state, {
				cardId: input.cardId,
				rating: input.rating,
				reviewedAt: new Date().toISOString(),
			});

			await updateFlashcardStudyState(transaction, input, nextState);
			return nextState;
		}),
	);
}

export async function resetFlashcardStudyProgress(input: {
	itemId: string;
	userId: string;
	workspaceId: string;
}) {
	return await withDb((db) =>
		db.transaction(async (transaction) => {
			await requireFlashcardSet(transaction, input);
			await lockFlashcardStudyState(transaction, input);
			const state = createEmptyFlashcardStudyState();
			await updateFlashcardStudyState(transaction, input, state);
			return state;
		}),
	);
}

async function requireFlashcardSet(
	transaction: Transaction,
	input: { itemId: string; userId: string; workspaceId: string },
) {
	await assertCanReadWorkspace(transaction, input);
	const [item] = await transaction
		.select({ content: workspaceItemContents.content })
		.from(workspaceItems)
		.innerJoin(workspaceItemContents, eq(workspaceItems.id, workspaceItemContents.itemId))
		.where(
			and(
				eq(workspaceItems.id, input.itemId),
				eq(workspaceItems.workspaceId, input.workspaceId),
				eq(workspaceItems.type, "flashcard"),
			),
		)
		.limit(1);
	if (!item) throw new Error("Flashcard set not found.");
	return parseFlashcardSetContent(item.content).cards;
}

async function lockFlashcardStudyState(
	transaction: Transaction,
	input: { itemId: string; userId: string },
) {
	const emptyState = createEmptyFlashcardStudyState();
	await transaction
		.insert(workspaceItemUserStates)
		.values({ itemId: input.itemId, userId: input.userId, state: emptyState })
		.onConflictDoNothing();
	const [row] = await transaction
		.select({ state: workspaceItemUserStates.state })
		.from(workspaceItemUserStates)
		.where(
			and(
				eq(workspaceItemUserStates.userId, input.userId),
				eq(workspaceItemUserStates.itemId, input.itemId),
			),
		)
		.limit(1)
		.for("update");
	if (!row) throw new Error("Flashcard study state could not be created.");
	return parseFlashcardStudyState(row.state);
}

async function updateFlashcardStudyState(
	transaction: Transaction,
	input: { itemId: string; userId: string },
	state: ReturnType<typeof createEmptyFlashcardStudyState>,
) {
	await transaction
		.update(workspaceItemUserStates)
		.set({ state, updatedAt: new Date() })
		.where(
			and(
				eq(workspaceItemUserStates.userId, input.userId),
				eq(workspaceItemUserStates.itemId, input.itemId),
			),
		);
}
