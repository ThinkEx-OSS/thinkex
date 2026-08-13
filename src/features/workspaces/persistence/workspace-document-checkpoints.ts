import { eq, sql } from "drizzle-orm";

import { workspaceItemContents, workspaceItems } from "#/db/schema";
import { withDb } from "#/db/server";
import {
	getWorkspaceItemContentKind,
	workspaceItemTypeSchema,
} from "#/features/workspaces/contracts";
import { prepareDocumentItemMetadata } from "#/features/workspaces/documents/document-item-content";
import { notifyWorkspaceRoom } from "#/features/workspaces/realtime/workspace-room-notifier";
import {
	getActiveWorkspaceItemRow,
	lockWorkspaceForActor,
	nextWorkspaceRevision,
	requireActiveWorkspaceItem,
	toWorkspaceMetadata,
	withWorkspaceTransaction,
} from "./workspace-postgres-support";

export async function readWorkspaceDocumentCheckpoint(input: {
	itemId: string;
	workspaceId: string;
}) {
	return await withDb(async (db) => {
		const item = await requireActiveWorkspaceItem(db, input.workspaceId, input.itemId);
		if (getWorkspaceItemContentKind(item.type) !== "document") {
			throw new Error("Only document items have document checkpoints.");
		}
		const [checkpoint] = await db
			.select({ content: workspaceItemContents.content })
			.from(workspaceItemContents)
			.where(eq(workspaceItemContents.itemId, input.itemId))
			.limit(1);
		if (!checkpoint) {
			throw new Error("Workspace document checkpoint is missing.");
		}
		return { item, content: checkpoint.content };
	});
}

export async function commitWorkspaceDocumentCheckpoint(
	env: Cloudflare.Env,
	input: {
		actorUserId?: string | null;
		content: string;
		itemId: string;
		workspaceId: string;
	},
): Promise<"applied" | "discarded"> {
	const publication = await withWorkspaceTransaction(async (transaction) => {
		await lockWorkspaceForActor(transaction, input.workspaceId, input.actorUserId);
		const row = await getActiveWorkspaceItemRow(transaction, input.workspaceId, input.itemId);
		if (!row) return { outcome: "discarded" as const };
		if (getWorkspaceItemContentKind(workspaceItemTypeSchema.parse(row.type)) !== "document") {
			throw new Error("Only document checkpoints can update workspace text content.");
		}
		const metadata = prepareDocumentItemMetadata(toWorkspaceMetadata(row.metadata), input.content);
		const now = new Date();
		await transaction
			.insert(workspaceItemContents)
			.values({ itemId: input.itemId, content: input.content })
			.onConflictDoUpdate({
				target: workspaceItemContents.itemId,
				set: {
					content: input.content,
					revision: sql`${workspaceItemContents.revision} + 1`,
					updatedAt: now,
				},
			});
		await transaction
			.update(workspaceItems)
			.set({ metadata, updatedAt: now })
			.where(eq(workspaceItems.id, input.itemId));
		const item = await requireActiveWorkspaceItem(transaction, input.workspaceId, input.itemId);
		const revision = await nextWorkspaceRevision(transaction, input.workspaceId);
		return { outcome: "applied" as const, item, revision };
	});
	if (publication.outcome === "applied") {
		await notifyWorkspaceRoom(env, {
			type: "workspace.items.upserted",
			workspaceId: input.workspaceId,
			revision: publication.revision,
			items: [publication.item],
		});
	}
	return publication.outcome;
}
