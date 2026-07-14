import type { Workspace as ShellWorkspace } from "@cloudflare/shell";

import type { JsonValue, WorkspaceItemSummary } from "#/features/workspaces/contracts";
import { getWorkspaceFileItemObjectPrefix } from "#/features/workspaces/files/workspace-file-object-keys";
import { WORKSPACE_FILE_PREVIEW_CONTENT_TYPE } from "#/features/workspaces/files/workspace-file-preview.constants";
import type { WorkspaceKernelEventBus } from "#/features/workspaces/kernel/workspace-kernel-events";
import { WorkspaceKernelFileMigrator } from "#/features/workspaces/kernel/workspace-kernel-file-migrations";
import { getWorkspaceKernelFileShellPath } from "#/features/workspaces/kernel/workspace-kernel-files";
import { parseWorkspaceMetadataJson } from "#/features/workspaces/kernel/workspace-kernel-metadata";
import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";
import type {
	KernelItemProjectionRow,
	KernelItemRow,
} from "#/features/workspaces/kernel/workspace-kernel-rows";
import type { WorkspaceKernelStore } from "#/features/workspaces/kernel/workspace-kernel-store";
import type {
	CreateWorkspaceKernelFileFromUploadArgs,
	ReadWorkspaceKernelFileSourceArgs,
	ReadWorkspaceKernelFilePreviewResult,
	ReadWorkspaceKernelFileProjectionArgs,
	ReadWorkspaceKernelFileProjectionResult,
	UpsertWorkspaceKernelFileProjectionArgs,
	WorkspaceKernelFileProjectionFormat,
} from "#/features/workspaces/kernel/workspace-kernel-types";
import {
	getMetadataNumber,
	getMetadataString,
} from "#/features/workspaces/model/workspace-file/metadata";
import type { WorkspaceFileTypeDescriptor } from "#/features/workspaces/model/workspace-file/policy";
import {
	getWorkspaceFileShellExtension,
	getWorkspaceUploadFamily,
	normalizeWorkspaceUploadFileName,
	resolveWorkspaceFileContentType,
} from "#/features/workspaces/model/workspace-file/policy";
import type { WorkspaceCommandResult } from "#/features/workspaces/realtime/messages";
import { recordOperationalOutcome } from "#/integrations/observability/operational-events";
import { deleteR2Prefix } from "#/lib/r2";

export class WorkspaceKernelFileCommands {
	private readonly events: WorkspaceKernelEventBus;
	private readonly migrator: WorkspaceKernelFileMigrator;
	private readonly r2: R2Bucket;
	private readonly sql: WorkspaceKernelSql;
	private readonly store: WorkspaceKernelStore;
	private readonly workspace: ShellWorkspace;
	private readonly workspaceId: () => string;

	constructor(input: {
		events: WorkspaceKernelEventBus;
		r2: R2Bucket;
		sql: WorkspaceKernelSql;
		store: WorkspaceKernelStore;
		workspace: ShellWorkspace;
		workspaceId: () => string;
	}) {
		this.events = input.events;
		this.migrator = new WorkspaceKernelFileMigrator({
			bucket: input.r2,
			sql: input.sql,
			workspace: input.workspace,
			workspaceId: input.workspaceId,
		});
		this.r2 = input.r2;
		this.sql = input.sql;
		this.store = input.store;
		this.workspace = input.workspace;
		this.workspaceId = input.workspaceId;
	}

	async createFileFromUpload(
		input: CreateWorkspaceKernelFileFromUploadArgs,
	): Promise<WorkspaceCommandResult<WorkspaceItemSummary>> {
		const parentId = input.parentId ?? null;

		this.store.assertParentIsValid(parentId);

		if (this.store.getItemRowIncludingDeleted(input.id)) {
			throw new Error("Workspace item id already exists.");
		}

		const object = await this.r2.head(input.objectKey);

		if (!object) {
			throw new Error("Uploaded file was not found.");
		}

		if (object.size !== input.fileSize) {
			throw new Error("Uploaded file size did not match the upload request.");
		}

		const descriptor = getWorkspaceUploadFamily(input.assetKind);
		const contentType = resolveWorkspaceFileContentType({
			contentType: input.contentType,
			descriptor,
			fileName: input.fileName,
		});

		const now = Date.now();
		const itemId = input.id;
		const requestedName = normalizeWorkspaceUploadFileName(input.fileName, descriptor);
		const name = this.store.resolveItemName({
			itemId,
			type: "file",
			parentId,
			requestedName,
		});
		const shellPath = getWorkspaceKernelFileShellPath({
			itemId,
			extension: getWorkspaceFileShellExtension({
				contentType,
				descriptor,
				fileName: requestedName,
			}),
		});
		const metadataJson = createFileMetadata({
			contentType,
			descriptor,
			originalName: requestedName,
			sizeBytes: object.size,
			source: input.source,
		});

		this.sql`
			INSERT INTO kernel_items (
				id,
				parent_id,
				type,
				name,
				color,
				metadata_json,
				sort_order,
				shell_path,
				object_key,
				created_at,
				updated_at,
				deleted_at
			)
			VALUES (
				${itemId},
					${parentId},
					${"file"},
					${name},
					NULL,
					${JSON.stringify(metadataJson)},
				${this.store.getNextSortOrder(parentId)},
				${shellPath},
				${input.objectKey},
				${now},
				${now},
				NULL
			)
		`;

		const item = this.store.requireItem(itemId);
		const event = this.events.commit({
			type: "workspace.item.created",
			actorUserId: input.actorUserId ?? null,
			clientMutationId: input.clientMutationId ?? null,
			payload: { item },
		});

		return { result: item, event };
	}

	async getFileSource(input: ReadWorkspaceKernelFileSourceArgs) {
		const row = this.store.assertActiveItem(input.itemId);

		if (row.type !== "file") {
			throw new Error("Workspace item is not a file.");
		}

		const item = this.store.requireItem(input.itemId);
		const contentType = getMetadataString(item.metadataJson, "mimeType");
		const originalName = getMetadataString(item.metadataJson, "originalName");
		const sizeBytes = getMetadataNumber(item.metadataJson, "sizeBytes");
		const objectKey =
			row.object_key ??
			(await this.migrator.migrateSource(row.shell_path, item.id, {
				contentType: contentType ?? "application/octet-stream",
				expectedSize: sizeBytes,
			}));

		return {
			objectKey,
			contentType: contentType ?? "application/octet-stream",
			fileName: originalName ?? item.name,
			sizeBytes: sizeBytes ?? (await this.requireObject(objectKey)).size,
		};
	}

	async readFilePreview(
		input: ReadWorkspaceKernelFileSourceArgs,
	): Promise<ReadWorkspaceKernelFilePreviewResult | null> {
		const row = this.store.assertActiveItem(input.itemId);

		if (row.type !== "file") {
			throw new Error("Workspace item is not a file.");
		}

		const projection = this.getProjectionRow({
			itemId: input.itemId,
			format: "preview",
		});

		if (!projection) {
			return null;
		}

		const objectKey =
			projection.status === "ready"
				? (projection.object_key ?? (await this.migrator.migratePreview(projection, input.itemId)))
				: null;
		const metadataJson = parseProjectionMetadataJson(projection.metadata_json);

		return {
			itemId: projection.item_id,
			status: projection.status,
			objectKey,
			contentType: WORKSPACE_FILE_PREVIEW_CONTENT_TYPE,
			sizeBytes: getMetadataNumber(metadataJson, "sizeBytes"),
			sourceHash: projection.source_hash,
			metadataJson,
			updatedAt: new Date(projection.updated_at).toISOString(),
		};
	}

	async upsertFileProjection(input: UpsertWorkspaceKernelFileProjectionArgs): Promise<void> {
		const row = this.store.assertActiveItem(input.itemId);

		if (row.type !== "file") {
			throw new Error("Workspace item is not a file.");
		}
		if (input.status === "ready" && input.format === "pages") {
			if (!row.object_key) {
				throw new Error("Ready page projections require a source hash and manifest object.");
			}
			const [source, manifest] = await Promise.all([
				this.r2.head(row.object_key),
				this.r2.head(input.objectKey),
			]);
			if (!source || source.etag !== input.sourceHash) {
				throw new Error("The file source changed before its extraction could be published.");
			}
			if (!manifest) {
				throw new Error("The page projection manifest was not found.");
			}
		}

		const now = Date.now();

		await this.writeProjectionRow({
			itemId: input.itemId,
			projection: input,
			now,
		});
	}

	private async writeProjectionRow(input: {
		createdAt?: number;
		itemId: string;
		projection: UpsertWorkspaceKernelFileProjectionArgs;
		now: number;
	}) {
		const legacyContentPath = this.getProjectionRow({
			itemId: input.itemId,
			format: input.projection.format,
		})?.content_shell_path;

		this.sql`
			INSERT INTO kernel_item_projections (
				item_id,
				format,
				status,
				provider,
				provider_mode,
				content_shell_path,
				object_key,
				error_message,
				source_hash,
				metadata_json,
				created_at,
				updated_at
			)
			VALUES (
				${input.itemId},
				${input.projection.format},
				${input.projection.status},
				${input.projection.provider ?? null},
				${input.projection.providerMode ?? null},
				NULL,
				${input.projection.objectKey ?? null},
					${input.projection.errorMessage ?? null},
					${input.projection.sourceHash ?? null},
					${JSON.stringify(input.projection.metadataJson ?? {})},
					${input.createdAt ?? input.now},
					${input.now}
				)
			ON CONFLICT(item_id, format) DO UPDATE SET
				status = excluded.status,
				provider = excluded.provider,
				provider_mode = excluded.provider_mode,
				content_shell_path = NULL,
				object_key = excluded.object_key,
				error_message = excluded.error_message,
				source_hash = excluded.source_hash,
				metadata_json = excluded.metadata_json,
				updated_at = excluded.updated_at
		`;

		if (legacyContentPath) {
			await this.workspace.rm(legacyContentPath, { force: true });
		}
	}

	async readFileProjection(
		input: ReadWorkspaceKernelFileProjectionArgs,
	): Promise<ReadWorkspaceKernelFileProjectionResult | null> {
		const row = this.store.assertActiveItem(input.itemId);

		if (row.type !== "file") {
			throw new Error("Workspace item is not a file.");
		}

		let projection = this.getProjectionRow(input);

		if (!projection) {
			return null;
		}
		if (
			projection.status === "ready" &&
			projection.format === "pages" &&
			!projection.object_key &&
			projection.content_shell_path
		) {
			await this.migrator.migratePageProjection(projection);
			projection = this.getProjectionRow(input);
			if (!projection) {
				return null;
			}
		}

		return {
			itemId: projection.item_id,
			format: projection.format,
			status: projection.status,
			objectKey: projection.object_key,
			provider: projection.provider,
			providerMode: projection.provider_mode,
			errorMessage: projection.error_message,
			sourceHash: projection.source_hash,
			metadataJson: parseProjectionMetadataJson(projection.metadata_json),
			updatedAt: new Date(projection.updated_at).toISOString(),
		};
	}

	private getProjectionRow(input: { itemId: string; format: WorkspaceKernelFileProjectionFormat }) {
		return (
			this.sql<KernelItemProjectionRow>`
				SELECT *
				FROM kernel_item_projections
				WHERE item_id = ${input.itemId} AND format = ${input.format}
				LIMIT 1
			`[0] ?? null
		);
	}

	async deleteObjects(itemIds: string[]) {
		const fileItemIds = itemIds.filter(
			(itemId) => this.store.getItemRowIncludingDeleted(itemId)?.type === "file",
		);
		const results = await Promise.allSettled(
			fileItemIds.map((itemId) =>
				deleteR2Prefix(
					this.r2,
					getWorkspaceFileItemObjectPrefix({ workspaceId: this.workspaceId(), itemId }),
				),
			),
		);
		const failure = results.find((result) => result.status === "rejected");

		if (failure?.status === "rejected") {
			recordOperationalOutcome({
				error: failure.reason,
				event: "workspace_file_object_cleanup",
				fields: {
					item_count: fileItemIds.length,
					workspace_id: this.workspaceId(),
				},
			});
		}
	}

	async migrateLegacyStorage() {
		const sourceRows = this.sql<KernelItemRow>`
			SELECT * FROM kernel_items
			WHERE type = 'file' AND object_key IS NULL
		`;
		const projectionRows = this.sql<KernelItemProjectionRow>`
			SELECT * FROM kernel_item_projections
			WHERE content_shell_path IS NOT NULL
		`;
		const orphanedItemIds = new Set<string>();
		let orphanedProjectionCount = 0;

		for (const row of sourceRows) {
			if (!(await this.workspace.stat(row.shell_path))) {
				orphanedItemIds.add(row.id);
				const orphanedProjections = projectionRows.filter(
					(candidate) => candidate.item_id === row.id && candidate.content_shell_path,
				);
				orphanedProjectionCount += orphanedProjections.length;
				for (const projection of orphanedProjections) {
					await this.workspace.rm(projection.content_shell_path!, { force: true });
				}
				this.sql`DELETE FROM kernel_item_projections WHERE item_id = ${row.id}`;
				this
					.sql`DELETE FROM kernel_relations WHERE from_item_id = ${row.id} OR to_item_id = ${row.id}`;
				this.sql`DELETE FROM kernel_items WHERE id = ${row.id}`;
				await deleteR2Prefix(
					this.r2,
					getWorkspaceFileItemObjectPrefix({ workspaceId: this.workspaceId(), itemId: row.id }),
				);
				continue;
			}

			const metadata = parseWorkspaceMetadataJson(row.metadata_json);
			await this.migrator.migrateSource(row.shell_path, row.id, {
				contentType: getMetadataString(metadata, "mimeType") ?? "application/octet-stream",
				expectedSize: getMetadataNumber(metadata, "sizeBytes"),
			});
		}

		for (const projection of projectionRows) {
			if (orphanedItemIds.has(projection.item_id)) {
				continue;
			}
			if (projection.format === "pages") {
				await this.migrator.migratePageProjection(projection);
			} else {
				await this.migrator.migratePreview(projection, projection.item_id);
			}
		}

		const remainingSources =
			this.sql<{ count: number }>`
			SELECT COUNT(*) AS count FROM kernel_items
			WHERE type = 'file' AND object_key IS NULL
		`[0]?.count ?? 0;
		const remainingProjections =
			this.sql<{ count: number }>`
			SELECT COUNT(*) AS count FROM kernel_item_projections
			WHERE content_shell_path IS NOT NULL
		`[0]?.count ?? 0;

		return {
			migratedSources: sourceRows.length - orphanedItemIds.size,
			migratedProjections: projectionRows.length - orphanedProjectionCount,
			orphanedFilesRemoved: orphanedItemIds.size,
			remainingSources,
			remainingProjections,
		};
	}

	private async requireObject(objectKey: string) {
		const object = await this.r2.head(objectKey);

		if (!object) {
			throw new Error("Workspace file object was not found.");
		}

		return object;
	}
}

function createFileMetadata(input: {
	contentType: string;
	descriptor: WorkspaceFileTypeDescriptor;
	originalName: string;
	sizeBytes: number;
	source?: CreateWorkspaceKernelFileFromUploadArgs["source"];
}): Record<string, JsonValue> {
	const metadata: Record<string, JsonValue> = {
		assetKind: input.descriptor.assetKind,
		mimeType: input.contentType,
		originalName: input.originalName,
		sizeBytes: input.sizeBytes,
	};

	if (input.source) {
		metadata.source = {
			conversion: input.source.conversion,
			name: input.source.fileName,
			mimeType: input.source.mimeType,
			sizeBytes: input.source.sizeBytes,
		};
	}

	return metadata;
}

const parseProjectionMetadataJson = parseWorkspaceMetadataJson;
