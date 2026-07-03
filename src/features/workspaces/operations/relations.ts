import type { WorkspaceItemSummary, WorkspaceRelationKind } from "#/features/workspaces/contracts";
import {
	normalizeWorkspacePath,
	resolveWorkspaceKernelItemPath,
	WorkspaceKernelPathError,
	type WorkspaceKernelTree,
} from "#/features/workspaces/kernel/workspace-kernel-paths";
import type {
	CreateWorkspaceKernelRelationArgs,
	WorkspaceKernelItemRelation,
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
	createdItemsByPath?: ReadonlyMap<string, { id: string }>;
	excludeItemId?: string;
	fromItemId: string;
	relations?: WorkspaceRelationInput[];
	tree: WorkspaceKernelTree;
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

	for (const relation of input.relations ?? []) {
		const target = resolveWorkspaceRelationTarget({
			createdItemsByPath: input.createdItemsByPath,
			excludeItemId: input.excludeItemId,
			path: relation.path,
			tree: input.tree,
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
	createdItemsByPath?: ReadonlyMap<string, { id: string }>;
	excludeItemId?: string;
	path: string;
	tree: WorkspaceKernelTree;
}):
	| {
			itemId: string;
			status: "ready";
	  }
	| {
			failure: WorkspaceRelationFailure;
			status: "failed";
	  } {
	try {
		const normalizedPath = normalizeWorkspacePath(input.path);

		if (normalizedPath === "/") {
			return {
				failure: {
					code: "relation_path_is_root",
					path: normalizedPath,
				},
				status: "failed",
			};
		}

		const itemId =
			input.createdItemsByPath?.get(normalizedPath)?.id ??
			resolveWorkspaceKernelItemPath(normalizedPath, input.tree)?.id;

		if (!itemId) {
			return {
				failure: {
					code: "relation_path_not_found",
					path: normalizedPath,
				},
				status: "failed",
			};
		}

		if (input.excludeItemId && itemId === input.excludeItemId) {
			return {
				failure: {
					code: "relation_path_is_self",
					path: normalizedPath,
				},
				status: "failed",
			};
		}

		return {
			itemId,
			status: "ready",
		};
	} catch (error) {
		if (error instanceof WorkspaceKernelPathError && error.code === "path_not_absolute") {
			return {
				failure: {
					code: "relation_path_not_absolute",
					path: input.path,
				},
				status: "failed",
			};
		}

		throw error;
	}
}
