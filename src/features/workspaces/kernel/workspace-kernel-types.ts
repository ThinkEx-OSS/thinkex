import type {
	JsonValue,
	WorkspaceItemColor,
	WorkspaceItemFacts,
	WorkspaceItemSummary,
	WorkspaceRelationKind,
	WorkspaceItemType,
} from "#/features/workspaces/contracts";
import type {
	WorkspaceFileAssetKind,
	WorkspaceUploadConversion,
} from "#/features/workspaces/model/workspace-file";
import type { WorkspaceCommandResult } from "#/features/workspaces/realtime/messages";

export interface WorkspaceKernelPage {
	workspaceId: string;
	items: WorkspaceItemSummary[];
	itemFacts: WorkspaceItemFacts[];
	revision: number;
}

export interface CreateWorkspaceKernelRelationArgs {
	fromItemId: string;
	kind: WorkspaceRelationKind;
	note?: string | null;
	toItemId: string;
}

export interface LinkWorkspaceKernelItemsArgs {
	actorUserId?: string | null;
	clientMutationId?: string | null;
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
	id?: string;
	parentId?: string | null;
	type: WorkspaceItemType;
	name?: string;
	onNameConflict?: WorkspaceKernelNameConflictPolicy;
	color?: WorkspaceItemColor;
	metadataJson?: Record<string, JsonValue>;
	initialContent?: string;
	initialRelations?: CreateWorkspaceKernelRelationArgs[];
	actorUserId?: string | null;
	clientMutationId?: string | null;
}

export interface RenameWorkspaceKernelItemArgs {
	itemId: string;
	name: string;
	onNameConflict?: WorkspaceKernelNameConflictPolicy;
	actorUserId?: string | null;
	clientMutationId?: string | null;
}

export interface MoveWorkspaceKernelItemsArgs {
	items: Array<{
		itemId: string;
		sortOrder?: number;
	}>;
	parentId?: string | null;
	onNameConflict?: WorkspaceKernelNameConflictPolicy;
	actorUserId?: string | null;
	clientMutationId?: string | null;
}

export type MoveWorkspaceKernelItemsResult = WorkspaceItemSummary[];

export interface UpdateWorkspaceKernelItemColorArgs {
	itemId: string;
	color: WorkspaceItemColor;
	actorUserId?: string | null;
	clientMutationId?: string | null;
}

export interface DeleteWorkspaceKernelItemsArgs {
	itemIds: string[];
	actorUserId?: string | null;
	clientMutationId?: string | null;
}

export interface ReadWorkspaceDocumentCheckpointArgs {
	itemId: string;
}

export interface ReadWorkspaceKernelFileSourceArgs {
	itemId: string;
}

export interface WorkspaceKernelFileSource {
	objectKey: string;
	contentType: string;
	fileName: string;
	sizeBytes: number;
}

export type WorkspaceKernelFileProjectionFormat = "pages" | "preview";

export type WorkspaceKernelFileProjectionStatus =
	| "not_started"
	| "queued"
	| "processing"
	| "ready"
	| "failed";

interface WorkspaceKernelFileProjectionMutationBase {
	itemId: string;
	format: WorkspaceKernelFileProjectionFormat;
	actorUserId?: string | null;
	clientMutationId?: string | null;
}

export type UpsertWorkspaceKernelFileProjectionArgs =
	| (WorkspaceKernelFileProjectionMutationBase & {
			status: "processing";
			errorMessage?: never;
			metadataJson?: never;
			objectKey?: never;
			provider?: never;
			providerMode?: never;
			sourceHash?: never;
	  })
	| (WorkspaceKernelFileProjectionMutationBase & {
			status: "failed";
			errorMessage: string;
			metadataJson?: never;
			objectKey?: never;
			provider?: never;
			providerMode?: never;
			sourceHash?: never;
	  })
	| (WorkspaceKernelFileProjectionMutationBase & {
			status: "ready";
			errorMessage?: never;
			metadataJson?: Record<string, JsonValue>;
			objectKey: string;
			provider?: string | null;
			providerMode?: string | null;
			sourceHash: string;
	  });

export interface ReadWorkspaceKernelFilePreviewResult {
	itemId: string;
	status: WorkspaceKernelFileProjectionStatus;
	objectKey: string | null;
	contentType: string;
	sizeBytes: number | null;
	sourceHash: string | null;
	metadataJson: Record<string, JsonValue>;
	updatedAt: string;
}

export interface ReadWorkspaceKernelFileProjectionArgs {
	itemId: string;
	format: WorkspaceKernelFileProjectionFormat;
}

export interface ReadWorkspaceKernelFileProjectionResult {
	itemId: string;
	format: WorkspaceKernelFileProjectionFormat;
	status: WorkspaceKernelFileProjectionStatus;
	objectKey: string | null;
	provider: string | null;
	providerMode: string | null;
	errorMessage: string | null;
	sourceHash: string | null;
	metadataJson: Record<string, JsonValue>;
	updatedAt: string;
}

export interface CommitWorkspaceDocumentCheckpointArgs {
	itemId: string;
	content: string;
	actorUserId?: string | null;
	clientMutationId?: string | null;
}

export interface CreateWorkspaceKernelFileFromUploadArgs {
	id: string;
	parentId?: string | null;
	fileName: string;
	fileSize: number;
	objectKey: string;
	preview?: {
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
	clientMutationId?: string | null;
}

export interface DeleteWorkspaceKernelItemsResult {
	itemIds: string[];
	deletedItemIds: string[];
}
