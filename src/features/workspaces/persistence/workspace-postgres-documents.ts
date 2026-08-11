import { eq } from "drizzle-orm";

import { workspaceDocumentCheckpoints, workspaceItems } from "#/db/schema";
import { prepareDocumentItemMetadata } from "#/features/workspaces/documents/document-item-content";
import type {
	ReadWorkspaceDocumentCheckpointArgs,
	WorkspaceKernelPublishOutcome,
} from "#/features/workspaces/kernel/workspace-kernel-types";
import type { WorkspaceRevision } from "#/features/workspaces/realtime/messages";
import {
	getActiveWorkspaceItemRow,
	lockWorkspaceForActor,
	nextWorkspaceRevision,
	requireActiveWorkspaceItem,
	toWorkspaceMetadata,
	withWorkspaceDatabase,
	withWorkspaceTransaction,
} from "./workspace-postgres-support";

export class PostgresWorkspaceDocuments {
	constructor(
		private readonly workspaceId: string,
		private readonly onChange?: (change: WorkspaceRevision) => Promise<void>,
	) {}

	async readCheckpoint(input: ReadWorkspaceDocumentCheckpointArgs) {
		return await withWorkspaceDatabase(async (db) => {
			const item = await requireActiveWorkspaceItem(db, this.workspaceId, input.itemId);
			if (item.type !== "document") {
				throw new Error("Only document items have document checkpoints.");
			}
			const [checkpoint] = await db
				.select({ content: workspaceDocumentCheckpoints.content })
				.from(workspaceDocumentCheckpoints)
				.where(eq(workspaceDocumentCheckpoints.itemId, item.id))
				.limit(1);
			if (!checkpoint) {
				throw new Error("Workspace document checkpoint is missing.");
			}
			return { item, content: checkpoint.content };
		});
	}

	async commitCheckpoint(input: {
		itemId: string;
		content: string;
		actorUserId?: string | null;
	}): Promise<WorkspaceKernelPublishOutcome> {
		const publication = await withWorkspaceTransaction(async (transaction) => {
			await lockWorkspaceForActor(transaction, this.workspaceId, input.actorUserId);
			const row = await getActiveWorkspaceItemRow(transaction, this.workspaceId, input.itemId);
			if (!row) return { outcome: "discarded" as const };
			if (row.type !== "document") {
				throw new Error("Only document checkpoints can update workspace text content.");
			}
			const metadata = prepareDocumentItemMetadata(
				toWorkspaceMetadata(row.metadata),
				input.content,
			);
			const now = new Date();
			await transaction
				.insert(workspaceDocumentCheckpoints)
				.values({ itemId: row.id, content: input.content })
				.onConflictDoUpdate({
					target: workspaceDocumentCheckpoints.itemId,
					set: { content: input.content },
				});
			await transaction
				.update(workspaceItems)
				.set({ metadata, updatedAt: now })
				.where(eq(workspaceItems.id, row.id));
			const revision = await nextWorkspaceRevision(transaction, this.workspaceId);
			return { outcome: "applied" as const, revision };
		});
		if (publication.outcome === "applied") {
			await this.onChange?.({ workspaceId: this.workspaceId, revision: publication.revision });
		}
		return publication.outcome;
	}
}
