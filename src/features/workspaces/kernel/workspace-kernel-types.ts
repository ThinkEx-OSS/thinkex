import type {
	JsonValue,
	WorkspaceItemColor,
	WorkspaceItemSummary,
	WorkspaceItemType,
} from "#/features/workspaces/contracts";
import type {
	WorkspaceFileAssetKind,
	WorkspaceUploadConversion,
} from "#/features/workspaces/model/workspace-file";

export interface WorkspaceKernelPage {
	workspaceId: string;
	items: WorkspaceItemSummary[];
	revision: number;
}

export interface ListWorkspaceKernelItemsArgs {
	parentId?: string | null;
	limit?: number;
}

export type WorkspaceKernelNameConflictPolicy = "rename" | "error";

export interface CreateWorkspaceKernelItemArgs {
	id?: string;
	parentId?: string | null;
	type: WorkspaceItemType;
	name?: string;
	onNameConflict?: WorkspaceKernelNameConflictPolicy;
	color?: WorkspaceItemColor;
	metadataJson?: Record<string, JsonValue>;
	initialContent?: string;
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

export interface ReadWorkspaceKernelItemArgs {
	itemId: string;
}

export interface ReadWorkspaceKernelFileContentArgs {
	itemId: string;
}

export interface ReadWorkspaceKernelFileContentResult {
	bytes: Uint8Array;
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

export interface UpsertWorkspaceKernelFileProjectionArgs {
	itemId: string;
	format: WorkspaceKernelFileProjectionFormat;
	status: WorkspaceKernelFileProjectionStatus;
	content?: string | null;
	contentBytes?: Uint8Array | null;
	provider?: string | null;
	providerMode?: string | null;
	errorMessage?: string | null;
	sourceHash?: string | null;
	metadataJson?: Record<string, JsonValue>;
	actorUserId?: string | null;
	clientMutationId?: string | null;
}

export interface ReadWorkspaceKernelFilePreviewResult {
	itemId: string;
	status: WorkspaceKernelFileProjectionStatus;
	bytes: Uint8Array | null;
	contentType: string;
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
	content: string | null;
	provider: string | null;
	providerMode: string | null;
	errorMessage: string | null;
	sourceHash: string | null;
	metadataJson: Record<string, JsonValue>;
	updatedAt: string;
}

export interface WriteWorkspaceKernelItemArgs {
	itemId: string;
	content: string;
	actorUserId?: string | null;
	clientMutationId?: string | null;
}

export interface CreateWorkspaceKernelFileFromUploadArgs {
	parentId?: string | null;
	fileName: string;
	fileSize: number;
	objectKey: string;
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

export interface ListWorkspaceKernelEventsArgs {
	afterRevision: number;
	limit?: number;
}
