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
			if (!parseFlashcardSetContent(item.content).cards.some((card) => card.id === input.cardId)) {
				throw new Error("Flashcard not found.");
			}

			const [currentRow] = await transaction
				.select({ state: workspaceItemUserStates.state })
				.from(workspaceItemUserStates)
				.where(
					and(
						eq(workspaceItemUserStates.userId, input.userId),
						eq(workspaceItemUserStates.itemId, input.itemId),
					),
				)
				.limit(1);
			const state = currentRow
				? parseFlashcardStudyState(currentRow.state)
				: createEmptyFlashcardStudyState();
			const nextState = applyFlashcardStudyRating(state, {
				cardId: input.cardId,
				rating: input.rating,
				reviewedAt: new Date().toISOString(),
			});

			await transaction
				.insert(workspaceItemUserStates)
				.values({ itemId: input.itemId, userId: input.userId, state: nextState })
				.onConflictDoUpdate({
					target: [workspaceItemUserStates.userId, workspaceItemUserStates.itemId],
					set: { state: nextState, updatedAt: new Date() },
				});
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
			await assertCanReadWorkspace(transaction, input);
			const [item] = await transaction
				.select({ id: workspaceItems.id })
				.from(workspaceItems)
				.where(
					and(
						eq(workspaceItems.id, input.itemId),
						eq(workspaceItems.workspaceId, input.workspaceId),
						eq(workspaceItems.type, "flashcard"),
					),
				)
				.limit(1);
			if (!item) throw new Error("Flashcard set not found.");

			await transaction
				.delete(workspaceItemUserStates)
				.where(
					and(
						eq(workspaceItemUserStates.userId, input.userId),
						eq(workspaceItemUserStates.itemId, input.itemId),
					),
				);
			return createEmptyFlashcardStudyState();
		}),
	);
}
