import type { Workspace as ShellWorkspace } from "@cloudflare/shell";

import type { JsonValue, WorkspaceItemSummary } from "#/features/workspaces/contracts";
import { sha256Base64Url } from "#/features/workspaces/extraction/binary";
import {
	resolveUploadPreviewGenerator,
	WORKSPACE_FILE_PREVIEW_CONTENT_TYPE,
} from "#/features/workspaces/files/workspace-file-preview";
import type { WorkspaceKernelEventBus } from "#/features/workspaces/kernel/workspace-kernel-events";
import {
	getWorkspaceKernelFilePreviewShellPath,
	getWorkspaceKernelFileShellPath,
} from "#/features/workspaces/kernel/workspace-kernel-files";
import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";
import type { WorkspaceKernelStore } from "#/features/workspaces/kernel/workspace-kernel-store";
import type {
	CreateWorkspaceKernelFileFromUploadArgs,
	ReadWorkspaceKernelFileContentArgs,
	ReadWorkspaceKernelFileContentResult,
	ReadWorkspaceKernelFilePreviewResult,
	ReadWorkspaceKernelFileProjectionArgs,
	ReadWorkspaceKernelFileProjectionResult,
	UpsertWorkspaceKernelFileProjectionArgs,
	WorkspaceKernelFileProjectionFormat,
	WorkspaceKernelFileProjectionStatus,
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

export class WorkspaceKernelFileCommands {
	private readonly events: WorkspaceKernelEventBus;
	private readonly r2: R2Bucket;
	private readonly sql: WorkspaceKernelSql;
	private readonly store: WorkspaceKernelStore;
	private readonly workspace: ShellWorkspace;

	constructor(input: {
		events: WorkspaceKernelEventBus;
		r2: R2Bucket;
		sql: WorkspaceKernelSql;
		store: WorkspaceKernelStore;
		workspace: ShellWorkspace;
	}) {
		this.events = input.events;
		this.r2 = input.r2;
		this.sql = input.sql;
		this.store = input.store;
		this.workspace = input.workspace;
	}

	async createFileFromUpload(
		input: CreateWorkspaceKernelFileFromUploadArgs,
	): Promise<WorkspaceCommandResult<WorkspaceItemSummary>> {
		const parentId = input.parentId ?? null;

		this.store.assertParentIsValid(parentId);

		const object = await this.r2.get(input.objectKey);

		if (!object) {
			throw new Error("Uploaded file was not found.");
		}

		if (object.size !== input.fileSize) {
			throw new Error("Uploaded file size did not match the upload request.");
		}

		const bytes = new Uint8Array(await object.arrayBuffer());
		const descriptor = getWorkspaceUploadFamily(input.assetKind);
		const contentType = resolveWorkspaceFileContentType({
			contentType: input.contentType,
			descriptor,
			fileName: input.fileName,
		});

		const now = Date.now();
		const itemId = crypto.randomUUID();
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
			sizeBytes: bytes.byteLength,
			source: input.source,
		});

		await this.workspace.writeFileBytes(shellPath, bytes, contentType);
		await this.r2.delete(input.objectKey);

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

		const previewGenerator = resolveUploadPreviewGenerator(descriptor);

		if (previewGenerator) {
			await this.tryCreateUploadPreview({
				bytes,
				generate: previewGenerator,
				itemId,
				label: descriptor.assetKind,
				now,
			});
		}

		return { result: item, event };
	}

	async readFileContent(
		input: ReadWorkspaceKernelFileContentArgs,
	): Promise<ReadWorkspaceKernelFileContentResult> {
		const row = this.store.assertActiveItem(input.itemId);

		if (row.type !== "file") {
			throw new Error("Workspace item is not a file.");
		}

		const bytes = await this.workspace.readFileBytes(row.shell_path);

		if (!bytes) {
			throw new Error("Workspace file content was not found.");
		}

		const item = this.store.requireItem(input.itemId);
		const contentType = getMetadataString(item.metadataJson, "mimeType");
		const originalName = getMetadataString(item.metadataJson, "originalName");
		const sizeBytes = getMetadataNumber(item.metadataJson, "sizeBytes");

		return {
			bytes,
			contentType: contentType ?? "application/octet-stream",
			fileName: originalName ?? item.name,
			sizeBytes: sizeBytes ?? bytes.byteLength,
		};
	}

	async readFilePreview(
		input: ReadWorkspaceKernelFileContentArgs,
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

		const bytes =
			projection.status === "ready" && projection.content_shell_path
				? await this.workspace.readFileBytes(projection.content_shell_path)
				: null;

		return {
			itemId: projection.item_id,
			status: projection.status,
			bytes,
			contentType: WORKSPACE_FILE_PREVIEW_CONTENT_TYPE,
			sourceHash: projection.source_hash,
			metadataJson: parseProjectionMetadataJson(projection.metadata_json),
			updatedAt: new Date(projection.updated_at).toISOString(),
		};
	}

	async upsertFileProjection(input: UpsertWorkspaceKernelFileProjectionArgs): Promise<void> {
		const row = this.store.assertActiveItem(input.itemId);

		if (row.type !== "file") {
			throw new Error("Workspace item is not a file.");
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
		const contentShellPath =
			input.projection.content == null && input.projection.contentBytes == null
				? this.getExistingProjectionPath({
						itemId: input.itemId,
						format: input.projection.format,
					})
				: getWorkspaceKernelProjectionShellPath({
						itemId: input.itemId,
						format: input.projection.format,
					});

		if (input.projection.content != null) {
			const projectionShellPath = getWorkspaceKernelProjectionShellPath({
				itemId: input.itemId,
				format: input.projection.format,
			});

			await this.workspace.mkdir(`/items/${input.itemId}/projections`, {
				recursive: true,
			});
			await this.workspace.writeFile(
				projectionShellPath,
				input.projection.content,
				getProjectionContentType(input.projection.format),
			);
		}

		if (input.projection.contentBytes != null) {
			const previewShellPath = getWorkspaceKernelFilePreviewShellPath(input.itemId);

			await this.workspace.mkdir(`/items/${input.itemId}/derivatives`, {
				recursive: true,
			});
			await this.workspace.writeFileBytes(
				previewShellPath,
				input.projection.contentBytes,
				WORKSPACE_FILE_PREVIEW_CONTENT_TYPE,
			);
		}

		this.sql`
			INSERT INTO kernel_item_projections (
				item_id,
				format,
				status,
				provider,
				provider_mode,
				content_shell_path,
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
				${contentShellPath},
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
				content_shell_path = COALESCE(excluded.content_shell_path, kernel_item_projections.content_shell_path),
				error_message = excluded.error_message,
				source_hash = excluded.source_hash,
				metadata_json = excluded.metadata_json,
				updated_at = excluded.updated_at
		`;
	}

	async readFileProjection(
		input: ReadWorkspaceKernelFileProjectionArgs,
	): Promise<ReadWorkspaceKernelFileProjectionResult | null> {
		const row = this.store.assertActiveItem(input.itemId);

		if (row.type !== "file") {
			throw new Error("Workspace item is not a file.");
		}

		const projection = this.getProjectionRow(input);

		if (!projection) {
			return null;
		}

		return {
			itemId: projection.item_id,
			format: projection.format,
			status: projection.status,
			content: projection.content_shell_path
				? await this.workspace.readFile(projection.content_shell_path)
				: null,
			provider: projection.provider,
			providerMode: projection.provider_mode,
			errorMessage: projection.error_message,
			sourceHash: projection.source_hash,
			metadataJson: parseProjectionMetadataJson(projection.metadata_json),
			updatedAt: new Date(projection.updated_at).toISOString(),
		};
	}

	private getExistingProjectionPath(input: {
		itemId: string;
		format: WorkspaceKernelFileProjectionFormat;
	}) {
		return this.getProjectionRow(input)?.content_shell_path ?? null;
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

	private async tryCreateUploadPreview(input: {
		bytes: Uint8Array;
		generate: (bytes: Uint8Array) => Promise<{ bytes: Uint8Array; width: number; height: number }>;
		itemId: string;
		label: string;
		now: number;
	}) {
		try {
			const preview = await input.generate(input.bytes);
			const sourceHash = await sha256Base64Url(input.bytes);

			await this.writeProjectionRow({
				itemId: input.itemId,
				now: input.now,
				projection: {
					itemId: input.itemId,
					format: "preview",
					status: "ready",
					contentBytes: preview.bytes,
					sourceHash,
					metadataJson: {
						contentType: WORKSPACE_FILE_PREVIEW_CONTENT_TYPE,
						width: preview.width,
						height: preview.height,
					},
				},
			});
		} catch (error) {
			console.warn(`[WorkspaceKernel] Unable to generate ${input.label} preview`, error);

			await this.writeProjectionRow({
				itemId: input.itemId,
				now: input.now,
				projection: {
					itemId: input.itemId,
					format: "preview",
					status: "failed",
					errorMessage: getErrorMessage(error),
				},
			});
		}
	}
}

type KernelItemProjectionRow = {
	item_id: string;
	format: WorkspaceKernelFileProjectionFormat;
	status: WorkspaceKernelFileProjectionStatus;
	provider: string | null;
	provider_mode: string | null;
	content_shell_path: string | null;
	error_message: string | null;
	source_hash: string | null;
	metadata_json: string;
	created_at: number;
	updated_at: number;
};

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

function getWorkspaceKernelProjectionShellPath(input: {
	itemId: string;
	format: WorkspaceKernelFileProjectionFormat;
}) {
	if (input.format === "preview") {
		return getWorkspaceKernelFilePreviewShellPath(input.itemId);
	}

	return `/items/${input.itemId}/projections/${input.format}.json`;
}

function getProjectionContentType(format: WorkspaceKernelFileProjectionFormat) {
	return format === "pages" ? "application/json" : "text/markdown";
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function parseProjectionMetadataJson(value: string): Record<string, JsonValue> {
	try {
		const parsed = JSON.parse(value) as unknown;

		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {};
		}

		return parsed as Record<string, JsonValue>;
	} catch {
		return {};
	}
}
