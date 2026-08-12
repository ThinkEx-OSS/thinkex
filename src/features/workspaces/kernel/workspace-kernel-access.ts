import type {
	CreateWorkspaceItemInput,
	DeleteWorkspaceItemsInput,
	JsonValue,
	MoveWorkspaceItemsInput,
	RenameWorkspaceItemInput,
	UpdateWorkspaceItemColorInput,
	WorkspaceItemSummary,
} from "#/features/workspaces/contracts";
import {
	requireAppliedWorkspaceKernelMutation,
	type CreateWorkspaceKernelFileFromUploadArgs,
	type CreateWorkspaceKernelItemArgs,
	type DeleteWorkspaceKernelItemsResult,
	type GetWorkspaceKernelItemPathsArgs,
	type ListWorkspaceKernelItemRelationsArgs,
	type ListWorkspaceKernelItemsArgs,
	type LinkWorkspaceKernelItemsArgs,
	type MoveWorkspaceKernelItemsResult,
	type ReadWorkspaceKernelFilePreviewResult,
	type ReadWorkspaceFileExtractionArgs,
	type ReadWorkspaceFileExtractionResult,
	type UpdateWorkspaceFileExtractionArgs,
	type ResolveWorkspaceKernelPathsArgs,
	type WorkspaceKernelFileSource,
	type WorkspaceKernelItemRelation,
	type WorkspaceKernelNameConflictPolicy,
	type WorkspaceKernelMutationOutcome,
	type WorkspaceKernelPublishOutcome,
	type WorkspaceKernelItemPath,
	type WorkspaceKernelPathResolution,
} from "#/features/workspaces/kernel/workspace-kernel-types";
import type { ListWorkspaceKernelItemsResult } from "#/features/workspaces/kernel/workspace-kernel-list";
import type { WorkspaceFileAssetKind } from "#/features/workspaces/model/workspace-file";
import type { WorkspaceCommandResult } from "#/features/workspaces/realtime/messages";
import { PostgresWorkspacePersistence } from "#/features/workspaces/persistence/workspace-postgres-persistence";
import {
	notifyWorkspaceRoom,
	requestWorkspaceItemCleanup,
} from "#/features/workspaces/realtime/workspace-room-notifier";

interface DeleteWorkspaceItemsResult {
	itemIds: string[];
	workspaceId: string;
	deletedItemIds: string[];
}

export interface WorkspaceKernelClient {
	getPage(input?: { userId?: string }): Promise<{
		workspaceId: string;
		items: WorkspaceItemSummary[];
		revision: number;
	}>;
	listTreeItems(input?: ListWorkspaceKernelItemsArgs): Promise<ListWorkspaceKernelItemsResult>;
	resolvePaths(input: ResolveWorkspaceKernelPathsArgs): Promise<WorkspaceKernelPathResolution[]>;
	getItemPaths(input: GetWorkspaceKernelItemPathsArgs): Promise<WorkspaceKernelItemPath[]>;
	linkItems(input: LinkWorkspaceKernelItemsArgs): Promise<void>;
	listItemRelations(
		input: ListWorkspaceKernelItemRelationsArgs,
	): Promise<WorkspaceKernelItemRelation[]>;
	createItem(
		input: CreateWorkspaceKernelItemArgs,
	): Promise<WorkspaceKernelMutationOutcome<WorkspaceItemSummary>>;
	createFileFromUpload(
		input: CreateWorkspaceKernelFileFromUploadArgs,
	): Promise<WorkspaceCommandResult<WorkspaceItemSummary>>;
	renameItem(input: {
		itemId: string;
		name: string;
		onNameConflict?: WorkspaceKernelNameConflictPolicy;
		actorUserId?: string | null;
	}): Promise<WorkspaceKernelMutationOutcome<WorkspaceItemSummary>>;
	moveItems(input: {
		items: Array<{
			itemId: string;
			sortOrder?: number;
		}>;
		parentId?: string | null;
		onNameConflict?: WorkspaceKernelNameConflictPolicy;
		actorUserId?: string | null;
	}): Promise<WorkspaceKernelMutationOutcome<MoveWorkspaceKernelItemsResult>>;
	updateItemColor(input: {
		itemId: string;
		color: UpdateWorkspaceItemColorInput["color"];
		actorUserId?: string | null;
	}): Promise<WorkspaceCommandResult<WorkspaceItemSummary>>;
	deleteItems(input: {
		itemIds: string[];
		actorUserId?: string | null;
	}): Promise<WorkspaceCommandResult<DeleteWorkspaceKernelItemsResult>>;
	readDocumentCheckpoint(input: {
		itemId: string;
	}): Promise<{ item: WorkspaceItemSummary; content: string }>;
	getFileSource(input: { itemId: string; userId?: string }): Promise<WorkspaceKernelFileSource>;
	readFilePreview(input: {
		itemId: string;
		userId?: string;
	}): Promise<ReadWorkspaceKernelFilePreviewResult | null>;
	updateFileExtraction(
		input: UpdateWorkspaceFileExtractionArgs,
	): Promise<WorkspaceKernelPublishOutcome>;
	readFileExtraction(
		input: ReadWorkspaceFileExtractionArgs,
	): Promise<ReadWorkspaceFileExtractionResult | null>;
	commitDocumentCheckpoint(input: {
		itemId: string;
		content: string;
		actorUserId?: string | null;
	}): Promise<WorkspaceKernelPublishOutcome>;
	publishPages(input: {
		itemId: string;
		pages: Iterable<{ markdown: string; markdownBytes: number; pageNumber: number }>;
		provider: string;
		providerMode: string;
		sourceHash: string;
		tier: "fast" | "enhanced";
		metadataJson?: Record<string, JsonValue>;
		actorUserId?: string | null;
	}): Promise<WorkspaceKernelPublishOutcome>;
	readPages(input: {
		itemId: string;
		pageNumbers: number[];
	}): Promise<Array<{ markdown: string; markdownBytes: number; pageNumber: number }>>;
}

export async function readWorkspaceKernelFileSource(input: {
	workspaceId: string;
	userId: string;
	itemId: string;
}) {
	const kernel = await getWorkspaceKernel(input.workspaceId);

	return await kernel.getFileSource({ itemId: input.itemId, userId: input.userId });
}

export async function readWorkspaceKernelFilePreview(input: {
	workspaceId: string;
	userId: string;
	itemId: string;
}) {
	const kernel = await getWorkspaceKernel(input.workspaceId);

	return await kernel.readFilePreview({ itemId: input.itemId, userId: input.userId });
}

export async function createWorkspaceKernelItem(
	input: CreateWorkspaceItemInput & { userId: string },
): Promise<WorkspaceCommandResult<WorkspaceItemSummary>> {
	const kernel = await getWorkspaceKernel(input.workspaceId);

	return requireAppliedWorkspaceKernelMutation(
		await kernel.createItem({
			id: input.id,
			parentId: input.parentId ?? null,
			type: input.type,
			name: input.name,
			color: input.color,
			initialContent: input.initialContent,
			actorUserId: input.userId,
		}),
	);
}

export async function createWorkspaceFileFromUpload(input: {
	id: string;
	workspaceId: string;
	userId: string;
	parentId?: string | null;
	fileName: string;
	fileSize: number;
	objectKey: string;
	preview: CreateWorkspaceKernelFileFromUploadArgs["preview"];
	contentType?: string | null;
	assetKind: WorkspaceFileAssetKind;
	source?: CreateWorkspaceKernelFileFromUploadArgs["source"];
}): Promise<WorkspaceCommandResult<WorkspaceItemSummary>> {
	const kernel = await getWorkspaceKernel(input.workspaceId);

	return await kernel.createFileFromUpload({
		id: input.id,
		parentId: input.parentId ?? null,
		fileName: input.fileName,
		fileSize: input.fileSize,
		objectKey: input.objectKey,
		preview: input.preview,
		contentType: input.contentType ?? null,
		assetKind: input.assetKind,
		source: input.source,
		actorUserId: input.userId,
	});
}

export async function renameWorkspaceKernelItem(
	input: RenameWorkspaceItemInput & { userId: string },
): Promise<WorkspaceCommandResult<WorkspaceItemSummary>> {
	const kernel = await getWorkspaceKernel(input.workspaceId);

	return requireAppliedWorkspaceKernelMutation(
		await kernel.renameItem({
			itemId: input.itemId,
			name: input.name,
			actorUserId: input.userId,
		}),
	);
}

export async function moveWorkspaceKernelItems(
	input: MoveWorkspaceItemsInput & { userId: string },
): Promise<WorkspaceCommandResult<MoveWorkspaceKernelItemsResult>> {
	const kernel = await getWorkspaceKernel(input.workspaceId);

	return requireAppliedWorkspaceKernelMutation(
		await kernel.moveItems({
			items: input.items,
			parentId: input.parentId ?? null,
			actorUserId: input.userId,
		}),
	);
}

export async function updateWorkspaceKernelItemColor(
	input: UpdateWorkspaceItemColorInput & { userId: string },
): Promise<WorkspaceCommandResult<WorkspaceItemSummary>> {
	const kernel = await getWorkspaceKernel(input.workspaceId);

	return await kernel.updateItemColor({
		itemId: input.itemId,
		color: input.color,
		actorUserId: input.userId,
	});
}

export async function deleteWorkspaceKernelItems(
	input: DeleteWorkspaceItemsInput & { userId: string },
): Promise<WorkspaceCommandResult<DeleteWorkspaceItemsResult>> {
	const kernel = await getWorkspaceKernel(input.workspaceId);
	const command = await kernel.deleteItems({
		itemIds: input.itemIds,
		actorUserId: input.userId,
	});

	return {
		...command,
		result: {
			...command.result,
			workspaceId: input.workspaceId,
		},
	};
}

export async function getWorkspaceKernel(workspaceId: string) {
	const { env } = await import("cloudflare:workers");

	return getWorkspaceKernelFromEnv(env, workspaceId);
}

export async function getWorkspaceKernelFromEnv(
	env: Cloudflare.Env,
	workspaceId: string,
): Promise<WorkspaceKernelClient> {
	return new PostgresWorkspacePersistence(
		workspaceId,
		env.WORKSPACE_KERNEL_FILES,
		(change) => notifyWorkspaceRoom(env, change),
		(input) => requestWorkspaceItemCleanup(env, input),
	);
}
