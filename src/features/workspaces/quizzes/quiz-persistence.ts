import { and, eq } from "drizzle-orm";

import { workspaceItemContents, workspaceItems } from "#/db/schema";
import { withDb } from "#/db/server";
import {
	parseQuizSetContent,
	stringifyQuizSetContent,
	type QuizSetContent,
} from "#/features/workspaces/quizzes/quiz-content";
import {
	lockWorkspaceForActor,
	nextWorkspaceRevision,
	requireActiveWorkspaceItem,
	withWorkspaceTransaction,
} from "#/features/workspaces/persistence/workspace-postgres-support";
import { notifyWorkspaceRoom } from "#/features/workspaces/realtime/workspace-room-notifier";
import { assertCanReadWorkspace } from "#/features/workspaces/server/permissions";

export async function readQuizSet(input: { itemId: string; workspaceId: string; userId?: string }) {
	return await withDb(async (db) => {
		if (input.userId) {
			await assertCanReadWorkspace(db, { workspaceId: input.workspaceId, userId: input.userId });
		}
		const [row] = await db
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
		if (!row) throw new Error("Workspace item is not a quiz.");
		return parseQuizSetContent(row.content);
	});
}

export async function updateQuizSet<T>(
	env: Cloudflare.Env,
	input: {
		actorUserId?: string | null;
		itemId: string;
		workspaceId: string;
	},
	update: (content: QuizSetContent) =>
		| {
				changed: boolean;
				content: QuizSetContent;
				result: T;
		  }
		| Promise<{ changed: boolean; content: QuizSetContent; result: T }>,
) {
	const command = await withWorkspaceTransaction(async (transaction) => {
		await lockWorkspaceForActor(transaction, input.workspaceId, input.actorUserId);
		const [row] = await transaction
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
		if (!row) throw new Error("Workspace item is not a quiz.");
		const updated = await update(parseQuizSetContent(row.content));
		if (!updated.changed) return { item: null, revision: null, result: updated.result };
		const now = new Date();
		await transaction
			.update(workspaceItemContents)
			.set({ content: stringifyQuizSetContent(updated.content) })
			.where(eq(workspaceItemContents.itemId, input.itemId));
		await transaction
			.update(workspaceItems)
			.set({ updatedAt: now })
			.where(
				and(eq(workspaceItems.workspaceId, input.workspaceId), eq(workspaceItems.id, input.itemId)),
			);
		return {
			item: await requireActiveWorkspaceItem(transaction, input.workspaceId, input.itemId),
			revision: await nextWorkspaceRevision(transaction, input.workspaceId),
			result: updated.result,
		};
	});

	if (command.item && command.revision !== null) {
		await notifyWorkspaceRoom(env, {
			type: "workspace.items.upserted",
			workspaceId: input.workspaceId,
			revision: command.revision,
			items: [command.item],
		});
	}
	return command.result;
}
