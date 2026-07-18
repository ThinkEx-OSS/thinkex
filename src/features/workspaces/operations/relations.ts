import type { WorkspaceItemSummary, WorkspaceRelationKind } from "#/features/workspaces/contracts";
import type {
	CreateWorkspaceKernelRelationArgs,
	WorkspaceKernelItemRelation,
	WorkspaceKernelPathResolution,
} from "#/features/workspaces/kernel/workspace-kernel-types";

export interface WorkspaceRelationInput {
	kind: WorkspaceRelationKind;
	note?: string;
	path: string;
}

export const workspaceRelationFailureCodes = [
	"relation_path_is_root",
	"relation_path_is_self",
	"relation_path_not_absolute",
	"relation_path_not_found",
] as const;

export type WorkspaceRelationFailureCode = (typeof workspaceRelationFailureCodes)[number];

export interface WorkspaceRelationFailure {
	code: WorkspaceRelationFailureCode;
	path: string;
}

export interface WorkspaceRelationOutput {
	direction: "incoming" | "outgoing";
	kind: WorkspaceRelationKind;
	note?: string;
	path: string;
}

export function resolveWorkspaceRelations(input: {
	excludeItemId?: string;
	fromItemId: string;
	relations?: WorkspaceRelationInput[];
	targets: WorkspaceKernelPathResolution[];
}):
	| {
			relations: CreateWorkspaceKernelRelationArgs[];
			status: "ready";
	  }
	| {
			failure: WorkspaceRelationFailure;
			status: "failed";
	  } {
	const relations: CreateWorkspaceKernelRelationArgs[] = [];

	for (const [index, relation] of (input.relations ?? []).entries()) {
		const resolution = input.targets[index];
		if (!resolution) {
			throw new Error("Workspace relation target resolution did not match its input.");
		}
		const target = resolveWorkspaceRelationTarget({
			excludeItemId: input.excludeItemId,
			resolution,
		});

		if (target.status === "failed") {
			return target;
		}

		relations.push({
			fromItemId: input.fromItemId,
			toItemId: target.itemId,
			kind: relation.kind,
			note: relation.note,
		});
	}

	return {
		relations,
		status: "ready",
	};
}

export function serializeWorkspaceRelations(input: {
	item: WorkspaceItemSummary;
	pathsByItemId: ReadonlyMap<string, string>;
	relations: WorkspaceKernelItemRelation[];
}): WorkspaceRelationOutput[] {
	const serialized: WorkspaceRelationOutput[] = [];

	for (const relation of input.relations) {
		const isOutgoing = relation.fromItemId === input.item.id;
		const relatedItemId = isOutgoing ? relation.toItemId : relation.fromItemId;
		const path = input.pathsByItemId.get(relatedItemId);

		if (!path) {
			continue;
		}

		serialized.push({
			direction: isOutgoing ? "outgoing" : "incoming",
			kind: relation.kind,
			path,
			...(relation.note ? { note: relation.note } : {}),
		});
	}

	return serialized;
}

function resolveWorkspaceRelationTarget(input: {
	excludeItemId?: string;
	resolution: WorkspaceKernelPathResolution;
}):
	| {
			itemId: string;
			status: "ready";
	  }
	| {
			failure: WorkspaceRelationFailure;
			status: "failed";
	  } {
	const { resolution } = input;
	if (resolution.status === "invalid_path") {
		return {
			failure: {
				code: "relation_path_not_absolute",
				path: resolution.path,
			},
			status: "failed",
		};
	}

	if (resolution.status === "root") {
		return {
			failure: {
				code: "relation_path_is_root",
				path: resolution.path,
			},
			status: "failed",
		};
	}

	if (resolution.status === "not_found") {
		return {
			failure: {
				code: "relation_path_not_found",
				path: resolution.path,
			},
			status: "failed",
		};
	}
	const itemId = resolution.item.id;

	if (input.excludeItemId && itemId === input.excludeItemId) {
		return {
			failure: {
				code: "relation_path_is_self",
				path: resolution.path,
			},
			status: "failed",
		};
	}

	return {
		itemId,
		status: "ready",
	};
}
