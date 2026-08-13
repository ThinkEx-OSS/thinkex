import type {
	JsonValue,
	WorkspaceColor,
	WorkspaceItem,
	WorkspaceRelationKind,
	WorkspaceItemType,
} from "#/features/workspaces/contracts";
import type {
	WorkspaceFileAssetKind,
	WorkspaceUploadConversion,
} from "#/features/workspaces/model/workspace-file";
import type { WorkspaceCommandResult } from "#/features/workspaces/realtime/messages";

export interface CreateWorkspaceRelationArgs {
	fromItemId: string;
	kind: WorkspaceRelationKind;
	note?: string | null;
	toItemId: string;
}

export interface LinkWorkspaceItemsArgs {
	actorUserId?: string | null;
	relations: CreateWorkspaceRelationArgs[];
}

export interface ListWorkspaceItemRelationsArgs {
	itemId: string;
	limit?: number;
}

export interface WorkspaceItemRelation {
	id: string;
	fromItemId: string;
	kind: WorkspaceRelationKind;
	note: string | null;
	toItemId: string;
}

export interface ListWorkspaceItemsArgs {
	limit?: number;
	offset?: number;
	path?: string;
	recursive?: boolean;
}

export type WorkspacePathResolution =
	| {
			code: "path_not_absolute";
			path: string;
			status: "invalid_path";
	  }
	| {
			path: string;
			status: "not_found";
	  }
	| {
			path: string;
			status: "root";
	  }
	| {
			item: WorkspaceItem;
			path: string;
			status: "item";
	  };

export interface ResolveWorkspacePathsArgs {
	paths: string[];
}

export interface GetWorkspaceItemPathsArgs {
	itemIds: string[];
}

export type WorkspaceNameConflictPolicy = "rename" | "error";

export interface WorkspaceNameConflict {
	code: "name_conflict";
	itemId: string | null;
	requestedName: string | null;
}

export type WorkspaceMutationOutcome<T> =
	| {
			command: WorkspaceCommandResult<T>;
			status: "applied";
	  }
	| {
			conflict: WorkspaceNameConflict;
			status: "conflict";
	  };

export type WorkspacePublishOutcome = "applied" | "discarded";

export function requireAppliedWorkspaceMutation<T>(
	outcome: WorkspaceMutationOutcome<T>,
): WorkspaceCommandResult<T> {
	if (outcome.status === "conflict") {
		throw new Error("Workspace persistence unexpectedly returned a name conflict.", {
			cause: outcome.conflict,
		});
	}

	return outcome.command;
}

export interface CreateWorkspaceItemArgs {
	id: string;
	parentId?: string | null;
	type: WorkspaceItemType;
	name?: string;
	onNameConflict?: WorkspaceNameConflictPolicy;
	color?: WorkspaceColor;
	metadataJson?: Record<string, JsonValue>;
	initialContent?: string;
	initialRelations?: CreateWorkspaceRelationArgs[];
	actorUserId?: string | null;
}

export interface RenameWorkspaceItemArgs {
	itemId: string;
	name: string;
	onNameConflict?: WorkspaceNameConflictPolicy;
	actorUserId?: string | null;
}

export interface MoveWorkspaceItemsArgs {
	items: Array<{
		itemId: string;
		sortOrder?: number;
	}>;
	parentId?: string | null;
	onNameConflict?: WorkspaceNameConflictPolicy;
	actorUserId?: string | null;
}

export type MoveWorkspaceItemsResult = WorkspaceItem[];

export interface UpdateWorkspaceItemColorArgs {
	itemId: string;
	color: WorkspaceColor;
	actorUserId?: string | null;
}

export interface DeleteWorkspaceItemsArgs {
	itemIds: string[];
	actorUserId?: string | null;
}

export interface ReadWorkspaceFileSourceArgs {
	itemId: string;
	userId?: string;
}

export type WorkspaceFileExtractionStatus = "processing" | "ready" | "failed";

interface WorkspaceFileExtractionMutationBase {
	itemId: string;
	actorUserId?: string | null;
}

export type UpdateWorkspaceFileExtractionArgs =
	| (WorkspaceFileExtractionMutationBase & {
			status: "processing";
			errorMessage?: never;
	  })
	| (WorkspaceFileExtractionMutationBase & {
			status: "failed";
			errorMessage: string;
	  });

export interface ReadWorkspaceFileExtractionArgs {
	itemId: string;
}

export interface ReadWorkspaceFileExtractionResult {
	itemId: string;
	status: WorkspaceFileExtractionStatus;
	provider: string | null;
	providerMode: string | null;
	errorMessage: string | null;
	sourceHash: string | null;
	metadataJson: Record<string, JsonValue>;
	updatedAt: string;
}

export interface CreateWorkspaceFileFromUploadArgs {
	id: string;
	parentId?: string | null;
	fileName: string;
	fileSize: number;
	objectKey: string;
	preview: {
		objectKey: string;
		sizeBytes: number;
		sourceHash: string;
	};
	contentType?: string | null;
	assetKind: WorkspaceFileAssetKind;
	source?: {
		conversion: WorkspaceUploadConversion;
		fileName: string;
		mimeType: string | null;
		sizeBytes: number;
	};
	actorUserId?: string | null;
}

export interface DeleteWorkspaceItemsResult {
	itemIds: string[];
	deletedItemIds: string[];
}
