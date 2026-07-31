import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";
import { batchWorkspaceSearchValues } from "#/features/workspaces/search/workspace-search-batches";
import {
	createWorkspaceSearchEmbeddingText,
	iteratePreparedWorkspaceSearchChunks,
	type WorkspaceSearchFileSystem,
	type WorkspaceSearchIndexSource,
} from "#/features/workspaces/search/workspace-search-content";
import { embedWorkspaceSearchTexts } from "#/features/workspaces/search/workspace-search-embeddings";
import { createWorkspaceSearchVectorMetadata } from "#/features/workspaces/search/workspace-search-scope";
import {
	buildWorkspaceSearchSourceVersion,
	workspaceSearchIndexVersion,
} from "#/features/workspaces/search/workspace-search-version";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";
import { sha256Base64UrlText } from "#/lib/binary";

const searchIndexBatchSize = 2;
const searchChunkProcessingBatchSize = 32;
const maximumIndexAttempts = 5;
const maximumVectorDeleteAttempts = 5;
const vectorDeleteBatchSize = 100;

interface SearchSourceRow {
	id: string;
	name: string;
	parent_id: string | null;
	projection_object_key: string | null;
	projection_source_hash: string | null;
	projection_updated_at: number | null;
	shell_path: string;
	type: string;
	updated_at: number;
}

type ScopedWorkspaceSearchIndexSource = WorkspaceSearchIndexSource & {
	parentId: string | null;
};

interface SearchIndexChunk {
	chunkId: string;
	content: string;
	endLine: number | null;
	index: number;
	pageNumber: number | null;
	startLine: number | null;
}

export class WorkspaceSearchIndexer {
	private readonly ai: Ai;
	private readonly bucket: R2Bucket;
	private readonly sql: WorkspaceKernelSql;
	private readonly vectorize: VectorizeIndex;
	private readonly workspace: WorkspaceSearchFileSystem;
	private readonly workspaceId: () => string;

	constructor(input: {
		ai: Ai;
		bucket: R2Bucket;
		sql: WorkspaceKernelSql;
		vectorize: VectorizeIndex;
		workspace: WorkspaceSearchFileSystem;
		workspaceId: () => string;
	}) {
		this.ai = input.ai;
		this.bucket = input.bucket;
		this.sql = input.sql;
		this.vectorize = input.vectorize;
		this.workspace = input.workspace;
		this.workspaceId = input.workspaceId;
	}

	seedPendingItems() {
		const now = Date.now();
		this.sql`
			INSERT INTO kernel_search_pending (item_id, requested_at)
			SELECT i.id, ${now}
			FROM kernel_items i
			LEFT JOIN kernel_item_projections p
				ON p.item_id = i.id
				AND p.format = 'pages'
				AND p.status = 'ready'
			LEFT JOIN kernel_search_items s ON s.item_id = i.id
				WHERE i.deleted_at IS NULL
					AND (
						i.type = 'document'
						OR (i.type = 'file' AND p.source_hash IS NOT NULL)
					)
					AND (
						s.item_id IS NULL
						OR s.source_version != CASE
							WHEN i.type = 'document'
								THEN ${workspaceSearchIndexVersion} || ':document:' || i.updated_at
							ELSE ${workspaceSearchIndexVersion} || ':file:' || i.updated_at || ':' || p.updated_at || ':' || p.source_hash
						END
						OR s.vector_status != 'ready'
					)
			ON CONFLICT(item_id) DO NOTHING
		`;
		this.sql`
			INSERT INTO kernel_search_pending (item_id, requested_at)
			SELECT s.item_id, ${now}
			FROM kernel_search_items s
			LEFT JOIN kernel_items i ON i.id = s.item_id AND i.deleted_at IS NULL
			WHERE i.id IS NULL
			ON CONFLICT(item_id) DO NOTHING
		`;
	}

	markPending(itemId: string) {
		this.sql`
			INSERT INTO kernel_search_pending (item_id, requested_at)
			VALUES (${itemId}, ${Date.now()})
			ON CONFLICT(item_id) DO UPDATE SET
				requested_at = excluded.requested_at,
				attempts = 0
		`;
	}

	hasPending() {
		return Boolean(
			this.sql<{ item_id: string }>`
				SELECT item_id FROM kernel_search_pending
				UNION ALL
				SELECT vector_id AS item_id
				FROM kernel_search_vector_deletes
				WHERE attempts < ${maximumVectorDeleteAttempts}
				LIMIT 1
			`[0],
		);
	}

	async processBatch() {
		await this.flushVectorDeletes();
		const pending = this.sql<{ item_id: string }>`
			SELECT item_id
			FROM kernel_search_pending
			ORDER BY requested_at ASC
			LIMIT ${searchIndexBatchSize}
		`;

		const failures: unknown[] = [];
		for (const row of pending) {
			try {
				await this.indexItem(row.item_id);
			} catch (error) {
				this.recordIndexFailure(row.item_id, error);
				if (!this.markIndexAttemptFailed(row.item_id)) {
					failures.push(error);
				}
			}
		}

		await this.flushVectorDeletes();
		if (failures.length > 0) {
			throw new AggregateError(failures, "Workspace search indexing failed.");
		}
		return this.hasPending();
	}

	async purgeVectors() {
		const ids = new Set(
			this.sql<{ vector_id: string }>`
				SELECT chunk_id AS vector_id FROM kernel_search_chunks
				UNION
				SELECT vector_id FROM kernel_search_vector_deletes
			`.map((row) => row.vector_id),
		);

		const failures: unknown[] = [];
		for (const batch of batchWorkspaceSearchValues(Array.from(ids), vectorDeleteBatchSize)) {
			try {
				await this.vectorize.deleteByIds(batch);
				this.deletePurgedVectorState(batch);
			} catch (error) {
				failures.push(error);
			}
		}
		if (failures.length > 0) {
			throw new AggregateError(failures, "Workspace search vector purge failed.");
		}
	}

	private async indexItem(itemId: string) {
		const source = this.getIndexSource(itemId);
		if (!source) {
			this.removeIndexedItem(itemId);
			return;
		}

		const revisionKey = await sha256Base64UrlText(
			`${this.workspaceId()}:${source.itemId}:${source.sourceVersion}`,
		);
		if (!this.isCurrentSource(source)) {
			return;
		}
		this.beginIndex(source);

		let chunks: SearchIndexChunk[] = [];
		for await (const prepared of iteratePreparedWorkspaceSearchChunks({
			bucket: this.bucket,
			source,
			workspace: this.workspace,
		})) {
			const chunk = {
				...prepared,
				chunkId: `s${revisionKey}-${prepared.index}`,
			};
			this.insertChunk(source, chunk);
			chunks.push(chunk);

			if (chunks.length === searchChunkProcessingBatchSize) {
				if (!(await this.indexChunkBatch(source, chunks))) {
					return;
				}
				chunks = [];
			}
		}

		if (chunks.length > 0 && !(await this.indexChunkBatch(source, chunks))) {
			return;
		}
		if (!this.isCurrentSource(source)) {
			return;
		}
		this.markVectorIndexReady(source);
	}

	private getIndexSource(itemId: string): ScopedWorkspaceSearchIndexSource | null {
		const row = this.sql<SearchSourceRow>`
			SELECT
				i.id,
				i.type,
				i.name,
				i.parent_id,
				i.shell_path,
				i.updated_at,
				p.object_key AS projection_object_key,
				p.source_hash AS projection_source_hash,
				p.updated_at AS projection_updated_at
			FROM kernel_items i
			LEFT JOIN kernel_item_projections p
				ON p.item_id = i.id
				AND p.format = 'pages'
				AND p.status = 'ready'
			WHERE i.id = ${itemId}
				AND i.deleted_at IS NULL
				AND i.type IN ('document', 'file')
			LIMIT 1
		`[0];
		if (!row) {
			return null;
		}

		const source = {
			itemId: row.id,
			name: row.name,
			parentId: row.parent_id,
		};

		if (row.type === "document") {
			return {
				...source,
				shellPath: row.shell_path,
				sourceVersion: buildWorkspaceSearchSourceVersion({
					type: "document",
					updatedAt: row.updated_at,
				}),
				type: "document",
			};
		}
		if (
			!row.projection_object_key ||
			!row.projection_source_hash ||
			row.projection_updated_at === null
		) {
			return null;
		}

		return {
			...source,
			objectKey: row.projection_object_key,
			sourceHash: row.projection_source_hash,
			sourceVersion: buildWorkspaceSearchSourceVersion({
				projectionUpdatedAt: row.projection_updated_at,
				sourceHash: row.projection_source_hash,
				type: "file",
				updatedAt: row.updated_at,
			}),
			type: "file",
		};
	}

	private isCurrentSource(source: ScopedWorkspaceSearchIndexSource) {
		const current = this.getIndexSource(source.itemId);
		return (
			current?.sourceVersion === source.sourceVersion &&
			current.name === source.name &&
			current.parentId === source.parentId
		);
	}

	private beginIndex(source: ScopedWorkspaceSearchIndexSource) {
		this.discardItemChunks(source.itemId);
		this.sql`
			INSERT INTO kernel_search_items (
				item_id,
				source_version,
				vector_status
			)
			VALUES (
				${source.itemId},
				${source.sourceVersion},
				'pending'
			)
			ON CONFLICT(item_id) DO UPDATE SET
				source_version = excluded.source_version,
				vector_status = 'pending'
		`;
	}

	private async indexChunkBatch(
		source: ScopedWorkspaceSearchIndexSource,
		chunks: readonly SearchIndexChunk[],
	) {
		if (!this.isCurrentSource(source)) {
			return false;
		}

		const embeddings = await embedWorkspaceSearchTexts(
			this.ai,
			chunks.map((chunk) =>
				createWorkspaceSearchEmbeddingText({
					content: chunk.content,
					title: source.name,
				}),
			),
		);
		if (embeddings.length !== chunks.length) {
			throw new Error("Workspace search embedding response did not match the indexed chunks.");
		}
		if (!this.isCurrentSource(source)) {
			return false;
		}

		const vectors = chunks.map((chunk, index): VectorizeVector => {
			const values = embeddings[index];
			if (!values) {
				throw new Error("Workspace search embedding was missing for an indexed chunk.");
			}
			return {
				id: chunk.chunkId,
				metadata: createWorkspaceSearchVectorMetadata({
					itemId: source.itemId,
					parentId: source.parentId,
					type: source.type,
				}),
				namespace: this.workspaceId(),
				values,
			};
		});
		await this.vectorize.upsert(vectors);
		if (!this.isCurrentSource(source)) {
			for (const vector of vectors) {
				this.queueVectorDelete(vector.id);
			}
			return false;
		}

		this.clearVectorDeletes(vectors.map((vector) => vector.id));
		return true;
	}

	private insertChunk(source: ScopedWorkspaceSearchIndexSource, chunk: SearchIndexChunk) {
		this.sql`
			INSERT INTO kernel_search_chunks (
				chunk_id,
				item_id,
				page_number,
				start_line,
				end_line
			)
			VALUES (
				${chunk.chunkId},
				${source.itemId},
				${chunk.pageNumber},
				${chunk.startLine},
				${chunk.endLine}
			)
		`;
		this.sql`
			INSERT INTO kernel_search_fts (rowid, chunk_id, title, content)
			SELECT rowid, chunk_id, ${source.name}, ${chunk.content}
			FROM kernel_search_chunks
			WHERE chunk_id = ${chunk.chunkId}
		`;
	}

	private markVectorIndexReady(source: ScopedWorkspaceSearchIndexSource) {
		this.sql`
			UPDATE kernel_search_items
			SET vector_status = 'ready'
			WHERE item_id = ${source.itemId} AND source_version = ${source.sourceVersion}
		`;
		this.sql`DELETE FROM kernel_search_pending WHERE item_id = ${source.itemId}`;
	}

	private removeIndexedItem(itemId: string) {
		this.discardItemChunks(itemId);
		this.sql`DELETE FROM kernel_search_items WHERE item_id = ${itemId}`;
		this.sql`DELETE FROM kernel_search_pending WHERE item_id = ${itemId}`;
	}

	private discardItemChunks(itemId: string) {
		for (const row of this.sql<{ chunk_id: string }>`
			SELECT chunk_id
			FROM kernel_search_chunks
			WHERE item_id = ${itemId}
		`) {
			this.queueVectorDelete(row.chunk_id);
		}
		this.deleteLocalChunks(itemId);
	}

	private deleteLocalChunks(itemId: string) {
		this.sql`
			DELETE FROM kernel_search_fts
			WHERE rowid IN (
				SELECT rowid FROM kernel_search_chunks WHERE item_id = ${itemId}
			)
		`;
		this.sql`DELETE FROM kernel_search_chunks WHERE item_id = ${itemId}`;
	}

	private deletePurgedVectorState(vectorIds: readonly string[]) {
		const vectorIdsJson = JSON.stringify(vectorIds);
		this.sql`
			DELETE FROM kernel_search_fts
			WHERE rowid IN (
				SELECT rowid
				FROM kernel_search_chunks
				WHERE chunk_id IN (SELECT value FROM json_each(${vectorIdsJson}))
			)
		`;
		this.sql`
			DELETE FROM kernel_search_chunks
			WHERE chunk_id IN (SELECT value FROM json_each(${vectorIdsJson}))
		`;
		this.clearVectorDeletes(vectorIds);
	}

	private queueVectorDelete(vectorId: string) {
		this.sql`
			INSERT INTO kernel_search_vector_deletes (vector_id, requested_at)
			VALUES (${vectorId}, ${Date.now()})
			ON CONFLICT(vector_id) DO NOTHING
		`;
	}

	private clearVectorDeletes(vectorIds: readonly string[]) {
		if (vectorIds.length === 0) {
			return;
		}
		this.sql`
			DELETE FROM kernel_search_vector_deletes
			WHERE vector_id IN (
				SELECT value FROM json_each(${JSON.stringify(vectorIds)})
			)
		`;
	}

	private async flushVectorDeletes() {
		const ids = this.sql<{ vector_id: string }>`
			SELECT vector_id
			FROM kernel_search_vector_deletes
			ORDER BY requested_at ASC
			LIMIT ${vectorDeleteBatchSize}
		`.map((row) => row.vector_id);
		if (ids.length === 0) {
			return;
		}

		try {
			await this.vectorize.deleteByIds(ids);
			this.sql`
				DELETE FROM kernel_search_vector_deletes
				WHERE vector_id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))
			`;
		} catch (error) {
			this.sql`
				UPDATE kernel_search_vector_deletes
				SET attempts = attempts + 1
				WHERE vector_id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))
			`;
			recordOperationalFailure({
				error,
				event: "workspace_search_vector_cleanup",
				fields: { workspace_id: this.workspaceId() },
			});
		}
	}

	private recordIndexFailure(itemId: string, error: unknown) {
		recordOperationalFailure({
			error,
			event: "workspace_search_indexing",
			fields: {
				item_id: itemId,
				workspace_id: this.workspaceId(),
			},
		});
	}

	private markIndexAttemptFailed(itemId: string) {
		const attempt = this.sql<{ attempts: number }>`
			UPDATE kernel_search_pending
			SET attempts = attempts + 1
			WHERE item_id = ${itemId}
			RETURNING attempts
		`[0];
		if (!attempt || attempt.attempts < maximumIndexAttempts) {
			return false;
		}

		this.discardItemChunks(itemId);
		this.sql`
			UPDATE kernel_search_items
			SET vector_status = 'failed'
			WHERE item_id = ${itemId}
		`;
		this.sql`DELETE FROM kernel_search_pending WHERE item_id = ${itemId}`;
		return true;
	}
}
