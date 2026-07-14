import type { Workspace as ShellWorkspace } from "@cloudflare/shell";

import type { JsonValue, WorkspaceItemSummary } from "#/features/workspaces/contracts";
import { sha256Base64Url } from "#/features/workspaces/extraction/binary";
import {
	resolveUploadPreviewGenerator,
	WORKSPACE_FILE_PREVIEW_CONTENT_TYPE,
} from "#/features/workspaces/files/workspace-file-preview";
import type { WorkspaceKernelEventBus } from "#/features/workspaces/kernel/workspace-kernel-events";
import {
	formatWorkspaceKernelByteLimit,
	WORKSPACE_KERNEL_MAX_IN_MEMORY_BYTES,
	WORKSPACE_KERNEL_MAX_PREVIEW_SOURCE_BYTES,
} from "#/features/workspaces/kernel/workspace-kernel-file-limits";
import {
	getWorkspaceKernelFilePreviewShellPath,
	getWorkspaceKernelFileShellPath,
} from "#/features/workspaces/kernel/workspace-kernel-files";
import { parseWorkspaceMetadataJson } from "#/features/workspaces/kernel/workspace-kernel-metadata";
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
import { recordOperationalOutcome } from "#/integrations/observability/operational-events";

export class WorkspaceKernelFileCommands {
	private readonly events: WorkspaceKernelEventBus;
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

		const object = await this.r2.get(input.objectKey);

		if (!object) {
			throw new Error("Uploaded file was not found.");
		}

		if (object.size !== input.fileSize) {
			throw new Error("Uploaded file size did not match the upload request.");
		}

		// Never materialize a body large enough to exhaust the DO isolate. Such files
		// already fail today by resetting the whole Durable Object (memory limit or
		// storage-timeout); fail cleanly here instead so concurrent in-flight writes
		// survive. The upload route rejects these earlier, so this is a safety net.
		if (object.size > WORKSPACE_KERNEL_MAX_IN_MEMORY_BYTES) {
			await this.r2.delete(input.objectKey);
			throw new Error(
				`File is too large to process (limit ${formatWorkspaceKernelByteLimit(
					WORKSPACE_KERNEL_MAX_IN_MEMORY_BYTES,
				)}).`,
			);
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

		// Preview decoding (pdfium / photon-wasm) inflates memory to several multiples
		// of the file size, so skip it for large files rather than risk the isolate.
		// Previews are best-effort; a missing one degrades to no thumbnail.
		if (previewGenerator && bytes.byteLength <= WORKSPACE_KERNEL_MAX_PREVIEW_SOURCE_BYTES) {
			await this.tryCreateUploadPreview({
				actorUserId: input.actorUserId ?? null,
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

		const item = this.store.requireItem(input.itemId);
		const contentType = getMetadataString(item.metadataJson, "mimeType");
		const originalName = getMetadataString(item.metadataJson, "originalName");
		const sizeBytes = getMetadataNumber(item.metadataJson, "sizeBytes");

		// Refuse to load a body large enough to reset the DO isolate. This can only be
		// hit by files ingested before the ingest cap existed; better a handled error
		// than a Durable Object reset that also loses concurrent in-flight writes.
		if (sizeBytes != null && sizeBytes > WORKSPACE_KERNEL_MAX_IN_MEMORY_BYTES) {
			throw new Error(
				`File is too large to load (limit ${formatWorkspaceKernelByteLimit(
					WORKSPACE_KERNEL_MAX_IN_MEMORY_BYTES,
				)}).`,
			);
		}

		const bytes = await this.workspace.readFileBytes(row.shell_path);

		if (!bytes) {
			throw new Error("Workspace file content was not found.");
		}

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
		actorUserId: string | null;
		bytes: Uint8Array;
		generate: (bytes: Uint8Array) => Promise<{ bytes: Uint8Array; width: number; height: number }>;
		itemId: string;
		label: string;
		now: number;
	}) {
		const startedAt = Date.now();
		let failure: unknown;
		let previewMetrics: { height: number; outputBytes: number; width: number } | undefined;

		try {
			const preview = await input.generate(input.bytes);
			previewMetrics = {
				height: preview.height,
				outputBytes: preview.bytes.byteLength,
				width: preview.width,
			};
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
			failure = error;

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
		} finally {
			recordOperationalOutcome({
				distinctId: input.actorUserId ?? undefined,
				error: failure,
				event: "workspace_file_preview",
				fields: {
					asset_kind: input.label,
					duration_ms: Date.now() - startedAt,
					height: previewMetrics?.height,
					input_bytes: input.bytes.byteLength,
					item_id: input.itemId,
					output_bytes: previewMetrics?.outputBytes,
					user_id: input.actorUserId,
					width: previewMetrics?.width,
					workspace_id: this.workspaceId(),
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

const parseProjectionMetadataJson = parseWorkspaceMetadataJson;
