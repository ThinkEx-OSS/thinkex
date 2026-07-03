import type { WorkspaceRelationKind } from "#/features/workspaces/contracts";
import { workspaceRelationKindSchema } from "#/features/workspaces/contracts";
import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";

export interface CreateWorkspaceKernelRelationInput {
	fromItemId: string;
	kind: WorkspaceRelationKind;
	note?: string | null;
	toItemId: string;
}

export interface WorkspaceKernelRelation {
	id: string;
	fromItemId: string;
	kind: WorkspaceRelationKind;
	note: string | null;
	toItemId: string;
}

type KernelRelationRow = {
	id: string;
	from_item_id: string;
	kind: string;
	note: string;
	to_item_id: string;
};

export class WorkspaceKernelRelations {
	constructor(private readonly sql: WorkspaceKernelSql) {}

	createRelations(relations: CreateWorkspaceKernelRelationInput[]) {
		for (const relation of relations) {
			const kind = workspaceRelationKindSchema.parse(relation.kind);
			const note = relation.note?.trim() ?? "";

			this.sql`
				INSERT OR IGNORE INTO kernel_relations (
					id,
					from_item_id,
					to_item_id,
					kind,
					note,
					created_at
				)
				VALUES (
					${crypto.randomUUID()},
					${relation.fromItemId},
					${relation.toItemId},
					${kind},
					${note},
					${Date.now()}
				)
			`;
		}
	}

	deleteRelationsForItems(itemIds: string[]) {
		for (const itemId of itemIds) {
			this.sql`
				DELETE FROM kernel_relations
				WHERE from_item_id = ${itemId} OR to_item_id = ${itemId}
			`;
		}
	}

	listItemRelations(itemId: string, limit = 40): WorkspaceKernelRelation[] {
		return this.sql<KernelRelationRow>`
			SELECT id, from_item_id, to_item_id, kind, note
			FROM kernel_relations
			WHERE from_item_id = ${itemId} OR to_item_id = ${itemId}
			ORDER BY created_at DESC, id ASC
			LIMIT ${Math.max(1, Math.min(limit, 100))}
		`.map(mapKernelRelationRow);
	}
}

function mapKernelRelationRow(row: KernelRelationRow): WorkspaceKernelRelation {
	return {
		id: row.id,
		fromItemId: row.from_item_id,
		toItemId: row.to_item_id,
		kind: workspaceRelationKindSchema.parse(row.kind),
		note: row.note || null,
	};
}
