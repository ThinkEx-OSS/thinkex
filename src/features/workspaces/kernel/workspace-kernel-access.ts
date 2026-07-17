import { createDbContext } from "#/db/server";
import { workspaceKernelAgentName } from "#/features/workspaces/agent-routes";
import type { ResourcePurgeResult } from "#/features/workspaces/resource-purge-result";
import type {
	CreateWorkspaceItemInput,
	DeleteWorkspaceItemsInput,
	JsonValue,
	MoveWorkspaceItemsInput,
	RenameWorkspaceItemInput,
	UpdateWorkspaceItemColorInput,
	WorkspaceItemFacts,
	WorkspaceItemSummary,
	WorkspacePage,
} from "#/features/workspaces/contracts";
import {
	requireAppliedWorkspaceKernelMutation,
	type CreateWorkspaceKernelFileFromUploadArgs,
	type CreateWorkspaceKernelRelationArgs,
	type DeleteWorkspaceKernelItemsResult,
	type ListWorkspaceKernelItemRelationsArgs,
	type MoveWorkspaceKernelItemsResult,
	type ReadWorkspaceKernelFilePreviewResult,
	type ReadWorkspaceKernelFileProjectionArgs,
	type ReadWorkspaceKernelFileProjectionResult,
	type UpsertWorkspaceKernelFileProjectionArgs,
	type WorkspaceKernelFileSource,
	type WorkspaceKernelItemRelation,
	type WorkspaceKernelNameConflictPolicy,
	type WorkspaceKernelMutationOutcome,
} from "#/features/workspaces/kernel/workspace-kernel-types";
import type { WorkspaceFileAssetKind } from "#/features/workspaces/model/workspace-file";
import type { WorkspaceCommandResult } from "#/features/workspaces/realtime/messages";
import {
	assertCanMutateWorkspace,
	assertCanReadWorkspace,
} from "#/features/workspaces/server/permissions";

interface DeleteWorkspaceItemsResult {
	itemIds: string[];
	workspaceId: string;
	deletedItemIds: string[];
}

export interface WorkspaceKernelClient {
	getPage(): Promise<{
		workspaceId: string;
		items: WorkspaceItemSummary[];
		itemFacts: WorkspaceItemFacts[];
		revision: number;
	}>;
	createRelations(input: { relations: CreateWorkspaceKernelRelationArgs[] }): Promise<void>;
	listItemRelations(
		input: ListWorkspaceKernelItemRelationsArgs,
	): Promise<WorkspaceKernelItemRelation[]>;
	createItem(input: {
		id?: string;
		parentId?: string | null;
		type: CreateWorkspaceItemInput["type"];
		name?: string;
		onNameConflict?: WorkspaceKernelNameConflictPolicy;
		color?: CreateWorkspaceItemInput["color"];
		metadataJson?: Record<string, JsonValue>;
		initialContent?: string;
		initialRelations?: CreateWorkspaceKernelRelationArgs[];
		actorUserId?: string | null;
		clientMutationId?: string | null;
	}): Promise<WorkspaceKernelMutationOutcome<WorkspaceItemSummary>>;
	createFileFromUpload(
		input: CreateWorkspaceKernelFileFromUploadArgs,
	): Promise<WorkspaceCommandResult<WorkspaceItemSummary>>;
	renameItem(input: {
		itemId: string;
		name: string;
		onNameConflict?: WorkspaceKernelNameConflictPolicy;
		actorUserId?: string | null;
		clientMutationId?: string | null;
	}): Promise<WorkspaceKernelMutationOutcome<WorkspaceItemSummary>>;
	moveItems(input: {
		items: Array<{
			itemId: string;
			sortOrder?: number;
		}>;
		parentId?: string | null;
		onNameConflict?: WorkspaceKernelNameConflictPolicy;
		actorUserId?: string | null;
		clientMutationId?: string | null;
	}): Promise<WorkspaceKernelMutationOutcome<MoveWorkspaceKernelItemsResult>>;
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
	getFileSource(input: { itemId: string }): Promise<WorkspaceKernelFileSource>;
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
	purgeForDeletion(): Promise<ResourcePurgeResult>;
}

export async function readWorkspaceKernelFileSource(input: {
	workspaceId: string;
	userId: string;
	itemId: string;
}) {
	const dbContext = await createDbContext();

	try {
		await assertCanReadWorkspace(dbContext.db, input);
		const kernel = await getWorkspaceKernel(input.workspaceId);

		return await kernel.getFileSource({ itemId: input.itemId });
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
			itemFacts: page.itemFacts,
			revision: page.revision,
		};
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

		return requireAppliedWorkspaceKernelMutation(
			await kernel.createItem({
				id: input.id,
				parentId: input.parentId ?? null,
				type: input.type,
				name: input.name,
				color: input.color,
				initialContent: input.initialContent,
				actorUserId: input.userId,
				clientMutationId: input.clientMutationId ?? null,
			}),
		);
	} finally {
		await dbContext.dispose();
	}
}

export async function createWorkspaceFileFromUpload(input: {
	id: string;
	workspaceId: string;
	userId: string;
	parentId?: string | null;
	fileName: string;
	fileSize: number;
	objectKey: string;
	preview?: CreateWorkspaceKernelFileFromUploadArgs["preview"];
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

		return requireAppliedWorkspaceKernelMutation(
			await kernel.renameItem({
				itemId: input.itemId,
				name: input.name,
				actorUserId: input.userId,
				clientMutationId: input.clientMutationId ?? null,
			}),
		);
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

		return requireAppliedWorkspaceKernelMutation(
			await kernel.moveItems({
				items: input.items,
				parentId: input.parentId ?? null,
				actorUserId: input.userId,
				clientMutationId: input.clientMutationId ?? null,
			}),
		);
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
	// The generated recursive Agent stub exceeds TypeScript's instantiation depth.
	// Keep that SDK limitation at this binding boundary instead of leaking casts to callers.
	const namespace: unknown = Reflect.get(env as object, workspaceKernelAgentName);
	if (!isWorkspaceKernelNamespace(namespace)) {
		throw new Error("Workspace kernel binding is unavailable.");
	}

	return namespace.getByName(workspaceId);
}

function isWorkspaceKernelNamespace(
	value: unknown,
): value is { getByName(name: string): WorkspaceKernelClient } {
	return (
		typeof value === "object" &&
		value !== null &&
		"getByName" in value &&
		typeof value.getByName === "function"
	);
}
