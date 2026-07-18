import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import { workspaceItemTypeSchema } from "#/features/workspaces/contracts";
import { getWorkspaceItemTypeMeta } from "#/features/workspaces/defaults";
import { parseWorkspaceMetadataJson } from "#/features/workspaces/kernel/workspace-kernel-metadata";
import type {
	WorkspaceKernelFileProjectionFormat,
	WorkspaceKernelFileProjectionStatus,
} from "#/features/workspaces/kernel/workspace-kernel-types";

export type KernelItemRow = {
	id: string;
	parent_id: string | null;
	type: string;
	name: string;
	color: string | null;
	metadata_json: string;
	sort_order: number;
	shell_path: string;
	object_key: string | null;
	created_at: number;
	updated_at: number;
	deleted_at: number | null;
};

export type KernelEventRow = {
	id: string;
	revision: number;
	type: string;
	actor_user_id: string | null;
	client_mutation_id: string | null;
	payload_json: string;
	created_at: number;
};

export type KernelItemProjectionRow = {
	item_id: string;
	format: WorkspaceKernelFileProjectionFormat;
	status: WorkspaceKernelFileProjectionStatus;
	provider: string | null;
	provider_mode: string | null;
	object_key: string | null;
	error_message: string | null;
	source_hash: string | null;
	metadata_json: string;
	created_at: number;
	updated_at: number;
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
		metadataJson: parseWorkspaceMetadataJson(row.metadata_json),
		sortOrder: row.sort_order,
		createdAt: new Date(row.created_at).toISOString(),
		updatedAt: new Date(row.updated_at).toISOString(),
		deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
	};
}
