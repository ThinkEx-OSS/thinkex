import { and, eq } from "drizzle-orm";

import { workspaceItemContents, workspaceItems, workspaceItemUserStates } from "#/db/schema";
import { withDb } from "#/db/server";
import { parseQuizSetContent } from "#/features/workspaces/quizzes/quiz-content";
import {
	applyQuizAnswer,
	createEmptyQuizStudyState,
	getQuizAnswer,
	parseQuizStudyState,
} from "#/features/workspaces/quizzes/quiz-study-state";
import { assertCanReadWorkspace } from "#/features/workspaces/server/permissions";
import type { Transaction } from "#/features/workspaces/persistence/workspace-postgres-support";

export async function readQuizViewer(input: {
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
					eq(workspaceItems.type, "quiz"),
				),
			)
			.limit(1);
		if (!row) throw new Error("Quiz not found.");
		return {
			questions: parseQuizSetContent(row.content).questions,
			studyState: parseQuizStudyState(row.state),
		};
	});
}

/**
 * Locks in one answer. Answers are first-pick-wins — a second submission for
 * the same question (a stale tab, a double click) leaves the recorded answer
 * alone, so the graded state a user saw never changes under them.
 */
export async function recordQuizAnswer(input: {
	itemId: string;
	questionId: string;
	selectedOptionId: string;
	userId: string;
	workspaceId: string;
}) {
	return await withDb((db) =>
		db.transaction(async (transaction) => {
			const questions = await requireQuizSet(transaction, input);
			const question = questions.find((entry) => entry.id === input.questionId);
			if (!question) {
				throw new Error("Quiz question not found.");
			}
			if (!question.options.some((option) => option.id === input.selectedOptionId)) {
				throw new Error("Quiz option not found.");
			}

			const state = await lockQuizStudyState(transaction, input);
			if (getQuizAnswer(question, state)) {
				return state;
			}
			const nextState = applyQuizAnswer(state, {
				questionId: input.questionId,
				selectedOptionId: input.selectedOptionId,
				answeredAt: new Date().toISOString(),
			});

			await updateQuizStudyState(transaction, input, nextState);
			return nextState;
		}),
	);
}

export async function resetQuizStudyProgress(input: {
	itemId: string;
	userId: string;
	workspaceId: string;
}) {
	return await withDb((db) =>
		db.transaction(async (transaction) => {
			await requireQuizSet(transaction, input);
			await lockQuizStudyState(transaction, input);
			const state = createEmptyQuizStudyState();
			await updateQuizStudyState(transaction, input, state);
			return state;
		}),
	);
}

async function requireQuizSet(
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
				eq(workspaceItems.type, "quiz"),
			),
		)
		.limit(1);
	if (!item) throw new Error("Quiz not found.");
	return parseQuizSetContent(item.content).questions;
}

async function lockQuizStudyState(
	transaction: Transaction,
	input: { itemId: string; userId: string },
) {
	const emptyState = createEmptyQuizStudyState();
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
	if (!row) throw new Error("Quiz study state could not be created.");
	return parseQuizStudyState(row.state);
}

async function updateQuizStudyState(
	transaction: Transaction,
	input: { itemId: string; userId: string },
	state: ReturnType<typeof createEmptyQuizStudyState>,
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
