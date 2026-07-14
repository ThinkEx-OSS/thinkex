import type { Workspace as ShellWorkspace } from "@cloudflare/shell";

import { parseMarkdownPagesProjection } from "#/features/workspaces/extraction/page-markdown-projection";
import { writeWorkspacePageProjection } from "#/features/workspaces/extraction/workspace-page-projection";
import {
	getWorkspaceFilePreviewObjectKey,
	getWorkspaceFileSourceObjectKey,
} from "#/features/workspaces/files/workspace-file-object-keys";
import { WORKSPACE_FILE_PREVIEW_CONTENT_TYPE } from "#/features/workspaces/files/workspace-file-preview.constants";
import { parseWorkspaceMetadataJson } from "#/features/workspaces/kernel/workspace-kernel-metadata";
import type { KernelItemProjectionRow } from "#/features/workspaces/kernel/workspace-kernel-rows";
import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";

export class WorkspaceKernelFileMigrator {
	private readonly bucket: R2Bucket;
	private readonly sql: WorkspaceKernelSql;
	private readonly workspace: ShellWorkspace;
	private readonly workspaceId: () => string;

	constructor(input: {
		bucket: R2Bucket;
		sql: WorkspaceKernelSql;
		workspace: ShellWorkspace;
		workspaceId: () => string;
	}) {
		this.bucket = input.bucket;
		this.sql = input.sql;
		this.workspace = input.workspace;
		this.workspaceId = input.workspaceId;
	}

	async migratePageProjection(projection: KernelItemProjectionRow) {
		if (!projection.content_shell_path) {
			return;
		}

		const content = await this.workspace.readFile(projection.content_shell_path);
		if (content === null) {
			throw new Error("Legacy page projection content was not found.");
		}

		const sourceHash = projection.source_hash ?? `legacy-${projection.updated_at}`;
		const reference = await writeWorkspacePageProjection({
			bucket: this.bucket,
			itemId: projection.item_id,
			metadata: parseWorkspaceMetadataJson(projection.metadata_json),
			pages: parseMarkdownPagesProjection(content),
			provider: projection.provider ?? "legacy",
			providerMode: projection.provider_mode ?? "legacy",
			runId: `legacy-${sourceHash}`,
			sourceHash,
			tier: "legacy",
			workspaceId: this.workspaceId(),
		});

		this.sql`
			UPDATE kernel_item_projections
			SET object_key = ${reference.manifestObjectKey}, content_shell_path = NULL
			WHERE item_id = ${projection.item_id} AND format = ${projection.format}
		`;
		await this.workspace.rm(projection.content_shell_path, { force: true });
	}

	async migrateSource(
		shellPath: string,
		itemId: string,
		input: { contentType: string; expectedSize: number | null },
	) {
		const objectKey = getWorkspaceFileSourceObjectKey({
			workspaceId: this.workspaceId(),
			itemId,
		});
		const object = await this.copyLegacyFile({
			contentType: input.contentType,
			expectedSize: input.expectedSize,
			objectKey,
			shellPath,
		});

		if (input.expectedSize !== null && object.size !== input.expectedSize) {
			await this.bucket.delete(objectKey);
			throw new Error("Legacy workspace file migration produced an invalid object.");
		}

		this.sql`UPDATE kernel_items SET object_key = ${objectKey} WHERE id = ${itemId}`;
		await this.workspace.rm(shellPath, { force: true });
		return objectKey;
	}

	async migratePreview(projection: KernelItemProjectionRow, itemId: string) {
		if (!projection.content_shell_path) {
			return null;
		}
		if (projection.object_key && (await this.bucket.head(projection.object_key))) {
			this.sql`
				UPDATE kernel_item_projections
				SET content_shell_path = NULL
				WHERE item_id = ${itemId} AND format = 'preview'
			`;
			await this.workspace.rm(projection.content_shell_path, { force: true });
			return projection.object_key;
		}

		const objectKey = getWorkspaceFilePreviewObjectKey({
			workspaceId: this.workspaceId(),
			itemId,
		});
		const object = await this.copyLegacyFile({
			contentType: WORKSPACE_FILE_PREVIEW_CONTENT_TYPE,
			expectedSize: null,
			objectKey,
			shellPath: projection.content_shell_path,
		});

		const metadataJson = {
			...parseWorkspaceMetadataJson(projection.metadata_json),
			sizeBytes: object.size,
		};
		this.sql`
			UPDATE kernel_item_projections
			SET object_key = ${objectKey},
				content_shell_path = NULL,
				metadata_json = ${JSON.stringify(metadataJson)}
			WHERE item_id = ${itemId} AND format = 'preview'
		`;
		await this.workspace.rm(projection.content_shell_path, { force: true });
		return objectKey;
	}

	private async copyLegacyFile(input: {
		contentType: string;
		expectedSize: number | null;
		objectKey: string;
		shellPath: string;
	}) {
		const [stat, stream] = await Promise.all([
			this.workspace.stat(input.shellPath),
			this.workspace.readFileStream(input.shellPath),
		]);

		if (!stat || !stream) {
			throw new Error("Legacy workspace file content was not found.");
		}
		if (input.expectedSize !== null && stat.size !== input.expectedSize) {
			throw new Error("Legacy workspace file size did not match its metadata.");
		}

		const fixedLengthStream = new FixedLengthStream(stat.size);
		const [object] = await Promise.all([
			this.bucket.put(input.objectKey, fixedLengthStream.readable, {
				httpMetadata: { contentType: input.contentType },
			}),
			stream.pipeTo(fixedLengthStream.writable),
		]);

		if (!object || object.size !== stat.size) {
			await this.bucket.delete(input.objectKey);
			throw new Error("Legacy workspace file migration produced an invalid object.");
		}

		return object;
	}
}
