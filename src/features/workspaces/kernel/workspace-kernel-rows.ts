import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import { workspaceItemTypeSchema } from "#/features/workspaces/contracts";
import { getWorkspaceItemTypeMeta } from "#/features/workspaces/defaults";
import { parseWorkspaceItemMetadataJson } from "#/features/workspaces/kernel/workspace-kernel-metadata";
import type { WorkspaceRealtimeEvent } from "#/features/workspaces/realtime/messages";

export type KernelItemRow = {
	id: string;
	parent_id: string | null;
	type: string;
	name: string;
	color: string | null;
	metadata_json: string;
	sort_order: number;
	shell_path: string;
	created_at: number;
	updated_at: number;
	deleted_at: number | null;
};

export type KernelEventRow = {
	id: string;
	revision: number;
	type: WorkspaceRealtimeEvent["type"];
	actor_user_id: string | null;
	client_mutation_id: string | null;
	payload_json: string;
	created_at: number;
};

export function mapKernelItemRow(row: KernelItemRow, workspaceId: string): WorkspaceItemSummary {
	const type = workspaceItemTypeSchema.parse(row.type);

	return {
		id: row.id,
		workspaceId,
		parentId: row.parent_id,
		type,
		title: row.name,
		name: row.name,
		meta: getWorkspaceItemTypeMeta(type),
		color: row.color,
		metadataJson: parseWorkspaceItemMetadataJson(row.metadata_json),
		sortOrder: row.sort_order,
		createdAt: new Date(row.created_at).toISOString(),
		updatedAt: new Date(row.updated_at).toISOString(),
		deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
	};
}

export function mapKernelEventRow(
	row: KernelEventRow,
	workspaceId: string,
): WorkspaceRealtimeEvent {
	return {
		id: row.id,
		revision: row.revision,
		workspaceId,
		type: row.type,
		actorUserId: row.actor_user_id,
		clientMutationId: row.client_mutation_id,
		createdAt: new Date(row.created_at).toISOString(),
		payload: parseWorkspaceEventPayload(row),
	} as WorkspaceRealtimeEvent;
}

function parseWorkspaceEventPayload(row: KernelEventRow): WorkspaceRealtimeEvent["payload"] {
	return JSON.parse(row.payload_json) as WorkspaceRealtimeEvent["payload"];
}
