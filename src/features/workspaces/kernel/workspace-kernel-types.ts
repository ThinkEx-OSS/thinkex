import type {
	JsonValue,
	WorkspaceItemColor,
	WorkspaceItemSummary,
	WorkspaceRelationKind,
	WorkspaceItemType,
} from "#/features/workspaces/contracts";
import type {
	WorkspaceFileAssetKind,
	WorkspaceUploadConversion,
} from "#/features/workspaces/model/workspace-file";
import type { WorkspaceCommandResult } from "#/features/workspaces/realtime/messages";

export interface CreateWorkspaceKernelRelationArgs {
	fromItemId: string;
	kind: WorkspaceRelationKind;
	note?: string | null;
	toItemId: string;
}

export interface LinkWorkspaceKernelItemsArgs {
	actorUserId?: string | null;
	relations: CreateWorkspaceKernelRelationArgs[];
}

export interface ListWorkspaceKernelItemRelationsArgs {
	itemId: string;
	limit?: number;
}

export interface WorkspaceKernelItemRelation {
	id: string;
	fromItemId: string;
	kind: WorkspaceRelationKind;
	note: string | null;
	toItemId: string;
}

export interface ListWorkspaceKernelItemsArgs {
	limit?: number;
	offset?: number;
	path?: string;
	recursive?: boolean;
}

export type WorkspaceKernelPathResolution =
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
			item: WorkspaceItemSummary;
			path: string;
			status: "item";
	  };

export interface ResolveWorkspaceKernelPathsArgs {
	paths: string[];
}

export interface GetWorkspaceKernelItemPathsArgs {
	itemIds: string[];
}

export interface WorkspaceKernelItemPath {
	itemId: string;
	path: string;
}

export type WorkspaceKernelNameConflictPolicy = "rename" | "error";

export interface WorkspaceKernelNameConflict {
	code: "name_conflict";
	itemId: string | null;
	requestedName: string | null;
}

export type WorkspaceKernelMutationOutcome<T> =
	| {
			command: WorkspaceCommandResult<T>;
			status: "applied";
	  }
	| {
			conflict: WorkspaceKernelNameConflict;
			status: "conflict";
	  };

export type WorkspaceKernelPublishOutcome = "applied" | "discarded";

export function requireAppliedWorkspaceKernelMutation<T>(
	outcome: WorkspaceKernelMutationOutcome<T>,
): WorkspaceCommandResult<T> {
	if (outcome.status === "conflict") {
		throw new Error("Workspace kernel unexpectedly returned a name conflict.", {
			cause: outcome.conflict,
		});
	}

	return outcome.command;
}

export interface CreateWorkspaceKernelItemArgs {
	id: string;
	parentId?: string | null;
	type: WorkspaceItemType;
	name?: string;
	onNameConflict?: WorkspaceKernelNameConflictPolicy;
	color?: WorkspaceItemColor;
	metadataJson?: Record<string, JsonValue>;
	initialContent?: string;
	initialRelations?: CreateWorkspaceKernelRelationArgs[];
	actorUserId?: string | null;
}

export interface RenameWorkspaceKernelItemArgs {
	itemId: string;
	name: string;
	onNameConflict?: WorkspaceKernelNameConflictPolicy;
	actorUserId?: string | null;
}

export interface MoveWorkspaceKernelItemsArgs {
	items: Array<{
		itemId: string;
		sortOrder?: number;
	}>;
	parentId?: string | null;
	onNameConflict?: WorkspaceKernelNameConflictPolicy;
	actorUserId?: string | null;
}

export type MoveWorkspaceKernelItemsResult = WorkspaceItemSummary[];

export interface UpdateWorkspaceKernelItemColorArgs {
	itemId: string;
	color: WorkspaceItemColor;
	actorUserId?: string | null;
}

export interface DeleteWorkspaceKernelItemsArgs {
	itemIds: string[];
	actorUserId?: string | null;
}

export interface ReadWorkspaceDocumentCheckpointArgs {
	itemId: string;
}

export interface ReadWorkspaceKernelFileSourceArgs {
	itemId: string;
	userId?: string;
}

export interface WorkspaceKernelFileSource {
	objectKey: string;
	contentType: string;
	fileName: string;
	sizeBytes: number;
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

export interface ReadWorkspaceKernelFilePreviewResult {
	itemId: string;
	status: WorkspaceFileExtractionStatus;
	objectKey: string | null;
	contentType: string;
	sizeBytes: number | null;
	sourceHash: string | null;
	metadataJson: Record<string, JsonValue>;
	updatedAt: string;
}

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

export interface CreateWorkspaceKernelFileFromUploadArgs {
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

export interface DeleteWorkspaceKernelItemsResult {
	itemIds: string[];
	deletedItemIds: string[];
}
