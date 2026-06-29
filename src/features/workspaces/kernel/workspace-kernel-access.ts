import { getAgentByName } from "agents";

import { createDbContext } from "#/db/server";
import { workspaceKernelAgentName } from "#/features/workspaces/agent-routes";
import type {
	CreateWorkspaceItemInput,
	DeleteWorkspaceItemsInput,
	JsonValue,
	MoveWorkspaceItemsInput,
	RenameWorkspaceItemInput,
	UpdateWorkspaceItemColorInput,
	WorkspaceItemSummary,
	WorkspacePage,
} from "#/features/workspaces/contracts";
import {
	type ListWorkspaceKernelItemsResult,
	listWorkspaceKernelPageItems,
} from "#/features/workspaces/kernel/workspace-kernel-list";
import type {
	CreateWorkspaceKernelFileFromUploadArgs,
	DeleteWorkspaceKernelItemsResult,
	MoveWorkspaceKernelItemsResult,
	ReadWorkspaceKernelFilePreviewResult,
	ReadWorkspaceKernelFileProjectionArgs,
	ReadWorkspaceKernelFileProjectionResult,
	UpsertWorkspaceKernelFileProjectionArgs,
	WorkspaceKernelNameConflictPolicy,
} from "#/features/workspaces/kernel/workspace-kernel-types";
import type { WorkspaceFileAssetKind } from "#/features/workspaces/model/workspace-file";
import type { WorkspaceCommandResult } from "#/features/workspaces/realtime/messages";
import {
	assertCanMutateWorkspace,
	assertCanReadWorkspace,
} from "#/features/workspaces/server/permissions";

export interface ListWorkspaceKernelItemsInput {
	workspaceId: string;
	userId: string;
	path?: string;
	recursive?: boolean;
	limit?: number;
}

interface DeleteWorkspaceItemsResult {
	itemIds: string[];
	workspaceId: string;
	deletedItemIds: string[];
}

export interface WorkspaceKernelClient {
	getPage(): Promise<{
		workspaceId: string;
		items: WorkspaceItemSummary[];
		revision: number;
	}>;
	createItem(input: {
		id?: string;
		parentId?: string | null;
		type: CreateWorkspaceItemInput["type"];
		name?: string;
		onNameConflict?: WorkspaceKernelNameConflictPolicy;
		color?: CreateWorkspaceItemInput["color"];
		metadataJson?: Record<string, JsonValue>;
		initialContent?: string;
		actorUserId?: string | null;
		clientMutationId?: string | null;
	}): Promise<WorkspaceCommandResult<WorkspaceItemSummary>>;
	createFileFromUpload(
		input: CreateWorkspaceKernelFileFromUploadArgs,
	): Promise<WorkspaceCommandResult<WorkspaceItemSummary>>;
	renameItem(input: {
		itemId: string;
		name: string;
		onNameConflict?: WorkspaceKernelNameConflictPolicy;
		actorUserId?: string | null;
		clientMutationId?: string | null;
	}): Promise<WorkspaceCommandResult<WorkspaceItemSummary>>;
	moveItems(input: {
		items: Array<{
			itemId: string;
			sortOrder?: number;
		}>;
		parentId?: string | null;
		onNameConflict?: WorkspaceKernelNameConflictPolicy;
		actorUserId?: string | null;
		clientMutationId?: string | null;
	}): Promise<WorkspaceCommandResult<MoveWorkspaceKernelItemsResult>>;
	updateItemColor(input: {
		itemId: string;
		color: UpdateWorkspaceItemColorInput["color"];
		actorUserId?: string | null;
		clientMutationId?: string | null;
	}): Promise<WorkspaceCommandResult<WorkspaceItemSummary>>;
	deleteItems(input: {
		itemIds: string[];
		actorUserId?: string | null;
		clientMutationId?: string | null;
	}): Promise<WorkspaceCommandResult<DeleteWorkspaceKernelItemsResult>>;
	readItem(input: {
		itemId: string;
	}): Promise<{ item: WorkspaceItemSummary; content: string | null }>;
	readFileContent(input: { itemId: string }): Promise<{
		bytes: Uint8Array;
		contentType: string;
		fileName: string;
		sizeBytes: number;
	}>;
	readFilePreview(input: { itemId: string }): Promise<ReadWorkspaceKernelFilePreviewResult | null>;
	upsertFileProjection(input: UpsertWorkspaceKernelFileProjectionArgs): Promise<void>;
	readFileProjection(
		input: ReadWorkspaceKernelFileProjectionArgs,
	): Promise<ReadWorkspaceKernelFileProjectionResult | null>;
	writeItem(input: {
		itemId: string;
		content: string;
		actorUserId?: string | null;
		clientMutationId?: string | null;
	}): Promise<WorkspaceCommandResult<WorkspaceItemSummary>>;
	purgeForDeletion(): Promise<void>;
}

export async function readWorkspaceKernelFileContent(input: {
	workspaceId: string;
	userId: string;
	itemId: string;
}) {
	const dbContext = await createDbContext();

	try {
		await assertCanReadWorkspace(dbContext.db, input);
		const kernel = await getWorkspaceKernel(input.workspaceId);

		return await kernel.readFileContent({ itemId: input.itemId });
	} finally {
		await dbContext.dispose();
	}
}

export async function readWorkspaceKernelFilePreview(input: {
	workspaceId: string;
	userId: string;
	itemId: string;
}) {
	const dbContext = await createDbContext();

	try {
		await assertCanReadWorkspace(dbContext.db, input);
		const kernel = await getWorkspaceKernel(input.workspaceId);

		return await kernel.readFilePreview({ itemId: input.itemId });
	} finally {
		await dbContext.dispose();
	}
}

export async function getWorkspaceKernelPage(input: {
	workspaceId: string;
	userId: string;
	workspace: WorkspacePage["workspace"];
}): Promise<WorkspacePage> {
	const dbContext = await createDbContext();

	try {
		await assertCanReadWorkspace(dbContext.db, input);
		const kernel = await getWorkspaceKernel(input.workspaceId);
		const page = await kernel.getPage();

		return {
			workspace: input.workspace,
			items: page.items,
			revision: page.revision,
		};
	} finally {
		await dbContext.dispose();
	}
}

export async function listWorkspaceKernelItems({
	workspaceId,
	userId,
	path = "/",
	recursive = false,
	limit,
}: ListWorkspaceKernelItemsInput): Promise<ListWorkspaceKernelItemsResult> {
	const dbContext = await createDbContext();

	try {
		await assertCanReadWorkspace(dbContext.db, { workspaceId, userId });
		const kernel = await getWorkspaceKernel(workspaceId);
		const page = await kernel.getPage();

		return listWorkspaceKernelPageItems({
			items: page.items,
			path,
			recursive,
			limit,
		});
	} finally {
		await dbContext.dispose();
	}
}

export async function createWorkspaceKernelItem(
	input: CreateWorkspaceItemInput & { userId: string },
): Promise<WorkspaceCommandResult<WorkspaceItemSummary>> {
	const dbContext = await createDbContext();

	try {
		await assertCanMutateWorkspace(dbContext.db, input);
		const kernel = await getWorkspaceKernel(input.workspaceId);

		return await kernel.createItem({
			id: input.id,
			parentId: input.parentId ?? null,
			type: input.type,
			name: input.name,
			color: input.color,
			initialContent: input.initialContent,
			actorUserId: input.userId,
			clientMutationId: input.clientMutationId ?? null,
		});
	} finally {
		await dbContext.dispose();
	}
}

export async function createWorkspaceFileFromUpload(input: {
	workspaceId: string;
	userId: string;
	parentId?: string | null;
	fileName: string;
	fileSize: number;
	objectKey: string;
	contentType?: string | null;
	assetKind: WorkspaceFileAssetKind;
	source?: CreateWorkspaceKernelFileFromUploadArgs["source"];
	clientMutationId?: string | null;
}): Promise<WorkspaceCommandResult<WorkspaceItemSummary>> {
	const dbContext = await createDbContext();

	try {
		await assertCanMutateWorkspace(dbContext.db, input);
		const kernel = await getWorkspaceKernel(input.workspaceId);

		return await kernel.createFileFromUpload({
			parentId: input.parentId ?? null,
			fileName: input.fileName,
			fileSize: input.fileSize,
			objectKey: input.objectKey,
			contentType: input.contentType ?? null,
			assetKind: input.assetKind,
			source: input.source,
			actorUserId: input.userId,
			clientMutationId: input.clientMutationId ?? null,
		});
	} finally {
		await dbContext.dispose();
	}
}

export async function renameWorkspaceKernelItem(
	input: RenameWorkspaceItemInput & { userId: string },
): Promise<WorkspaceCommandResult<WorkspaceItemSummary>> {
	const dbContext = await createDbContext();

	try {
		await assertCanMutateWorkspace(dbContext.db, input);
		const kernel = await getWorkspaceKernel(input.workspaceId);

		return await kernel.renameItem({
			itemId: input.itemId,
			name: input.name,
			actorUserId: input.userId,
			clientMutationId: input.clientMutationId ?? null,
		});
	} finally {
		await dbContext.dispose();
	}
}

export async function moveWorkspaceKernelItems(
	input: MoveWorkspaceItemsInput & { userId: string },
): Promise<WorkspaceCommandResult<MoveWorkspaceKernelItemsResult>> {
	const dbContext = await createDbContext();

	try {
		await assertCanMutateWorkspace(dbContext.db, input);
		const kernel = await getWorkspaceKernel(input.workspaceId);

		return await kernel.moveItems({
			items: input.items,
			parentId: input.parentId ?? null,
			actorUserId: input.userId,
			clientMutationId: input.clientMutationId ?? null,
		});
	} finally {
		await dbContext.dispose();
	}
}

export async function updateWorkspaceKernelItemColor(
	input: UpdateWorkspaceItemColorInput & { userId: string },
): Promise<WorkspaceCommandResult<WorkspaceItemSummary>> {
	const dbContext = await createDbContext();

	try {
		await assertCanMutateWorkspace(dbContext.db, input);
		const kernel = await getWorkspaceKernel(input.workspaceId);

		return await kernel.updateItemColor({
			itemId: input.itemId,
			color: input.color,
			actorUserId: input.userId,
			clientMutationId: input.clientMutationId ?? null,
		});
	} finally {
		await dbContext.dispose();
	}
}

export async function deleteWorkspaceKernelItems(
	input: DeleteWorkspaceItemsInput & { userId: string },
): Promise<WorkspaceCommandResult<DeleteWorkspaceItemsResult>> {
	const dbContext = await createDbContext();

	try {
		await assertCanMutateWorkspace(dbContext.db, input);
		const kernel = await getWorkspaceKernel(input.workspaceId);
		const command = await kernel.deleteItems({
			itemIds: input.itemIds,
			actorUserId: input.userId,
			clientMutationId: input.clientMutationId ?? null,
		});

		return {
			...command,
			result: {
				...command.result,
				workspaceId: input.workspaceId,
			},
		};
	} finally {
		await dbContext.dispose();
	}
}

export async function getWorkspaceKernel(workspaceId: string) {
	const { env } = await import("cloudflare:workers");

	return getWorkspaceKernelFromEnv(env, workspaceId);
}

export async function getWorkspaceKernelFromEnv(
	env: Cloudflare.Env,
	workspaceId: string,
): Promise<WorkspaceKernelClient> {
	return getAgentByName(
		env[workspaceKernelAgentName],
		workspaceId,
	) as unknown as WorkspaceKernelClient;
}
