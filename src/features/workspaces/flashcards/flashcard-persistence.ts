import { and, eq } from "drizzle-orm";

import { workspaceItemContents, workspaceItems } from "#/db/schema";
import { withDb } from "#/db/server";
import {
	parseFlashcardSetContent,
	stringifyFlashcardSetContent,
	type FlashcardSetContent,
} from "#/features/workspaces/flashcards/flashcard-content";
import {
	lockWorkspaceForActor,
	nextWorkspaceRevision,
	requireActiveWorkspaceItem,
	withWorkspaceTransaction,
} from "#/features/workspaces/persistence/workspace-postgres-support";
import { notifyWorkspaceRoom } from "#/features/workspaces/realtime/workspace-room-notifier";

export async function readFlashcardSet(input: { itemId: string; workspaceId: string }) {
	return await withDb(async (db) => {
		const [row] = await db
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
		if (!row) throw new Error("Workspace item is not a flashcard set.");
		return parseFlashcardSetContent(row.content);
	});
}

export async function updateFlashcardSet<T>(
	env: Cloudflare.Env,
	input: {
		actorUserId?: string | null;
		itemId: string;
		workspaceId: string;
	},
	update: (content: FlashcardSetContent) =>
		| {
				changed: boolean;
				content: FlashcardSetContent;
				result: T;
		  }
		| Promise<{ changed: boolean; content: FlashcardSetContent; result: T }>,
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
					eq(workspaceItems.type, "flashcard"),
				),
			)
			.limit(1);
		if (!row) throw new Error("Workspace item is not a flashcard set.");
		const updated = await update(parseFlashcardSetContent(row.content));
		if (!updated.changed) return { item: null, revision: null, result: updated.result };
		const now = new Date();
		await transaction
			.update(workspaceItemContents)
			.set({ content: stringifyFlashcardSetContent(updated.content) })
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
