import type { JsonValue } from "#/features/workspaces/contracts";
import { getMetadataString } from "#/features/workspaces/model/workspace-file/metadata";
import type { WorkspaceFileTypeDescriptor } from "#/features/workspaces/model/workspace-file/policy";
import { getWorkspaceUploadFamily } from "#/features/workspaces/model/workspace-file/policy";
import {
	type WorkspaceFileAssetKind,
	workspaceFileAssetKinds,
} from "#/features/workspaces/model/workspace-file/types";

export interface WorkspaceFileItemLike {
	type: string;
	name: string;
	metadataJson: Record<string, JsonValue>;
}

export function workspaceItemRequiresHeavyViewerRuntime(item: WorkspaceFileItemLike) {
	return resolveWorkspaceFileTypeFromItem(item)?.requiresHeavyViewerRuntime ?? false;
}

export function resolveWorkspaceFileTypeFromItem(
	item: WorkspaceFileItemLike,
): WorkspaceFileTypeDescriptor | null {
	if (item.type !== "file") {
		return null;
	}

	const assetKind = getMetadataString(item.metadataJson, "assetKind");

	if (!isWorkspaceFileAssetKind(assetKind)) {
		return null;
	}

	return getWorkspaceUploadFamily(assetKind);
}

function isWorkspaceFileAssetKind(value: string | null): value is WorkspaceFileAssetKind {
	return value !== null && (workspaceFileAssetKinds as readonly string[]).includes(value);
}
