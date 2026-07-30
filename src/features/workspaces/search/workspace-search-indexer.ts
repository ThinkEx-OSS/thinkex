import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import { buildWorkspaceKernelItemPathIndex } from "#/features/workspaces/kernel/workspace-kernel-paths";
import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";
import {
	createWorkspaceSearchEmbeddingText,
	prepareWorkspaceSearchChunks,
	type WorkspaceSearchFileSystem,
	type WorkspaceSearchIndexSource,
} from "#/features/workspaces/search/workspace-search-content";
import {
	batchWorkspaceSearchValues,
	embedWorkspaceSearchTexts,
} from "#/features/workspaces/search/workspace-search-embeddings";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";
import { sha256Base64UrlText } from "#/lib/binary";

const searchIndexBatchSize = 4;
const vectorMutationBatchSize = 1_000;
const vectorDeleteBatchSize = 100;
const maximumIndexAttempts = 5;

interface SearchSourceRow {
	id: string;
	name: string;
	projection_object_key: string | null;
	projection_source_hash: string | null;
	projection_updated_at: number | null;
	shell_path: string;
	type: string;
	updated_at: number;
}

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
	private readonly getItems: () => WorkspaceItemSummary[];
	private readonly sql: WorkspaceKernelSql;
	private readonly vectorize: VectorizeIndex;
	private readonly workspace: WorkspaceSearchFileSystem;
	private readonly workspaceId: () => string;

	constructor(input: {
		ai: Ai;
		bucket: R2Bucket;
		getItems: () => WorkspaceItemSummary[];
		sql: WorkspaceKernelSql;
		vectorize: VectorizeIndex;
		workspace: WorkspaceSearchFileSystem;
		workspaceId: () => string;
	}) {
		this.ai = input.ai;
		this.bucket = input.bucket;
		this.getItems = input.getItems;
		this.sql = input.sql;
		this.vectorize = input.vectorize;
		this.workspace = input.workspace;
		this.workspaceId = input.workspaceId;
	}

	seedPendingItems() {
		const now = Date.now();
		this.sql`
			INSERT INTO kernel_search_pending (item_id, requested_at, attempts)
			SELECT i.id, ${now}, 0
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
						WHEN i.type = 'document' THEN 'document:' || i.updated_at
						ELSE 'file:' || i.updated_at || ':' || p.updated_at || ':' || p.source_hash
					END
					OR s.vector_ready = 0
				)
			ON CONFLICT(item_id) DO NOTHING
		`;
		this.sql`
			INSERT INTO kernel_search_pending (item_id, requested_at, attempts)
			SELECT s.item_id, ${now}, 0
			FROM kernel_search_items s
			LEFT JOIN kernel_items i ON i.id = s.item_id AND i.deleted_at IS NULL
			WHERE i.id IS NULL
			ON CONFLICT(item_id) DO NOTHING
		`;
	}

	markPending(itemId: string) {
		this.sql`
			INSERT INTO kernel_search_pending (item_id, requested_at, attempts)
			VALUES (${itemId}, ${Date.now()}, 0)
			ON CONFLICT(item_id) DO UPDATE SET
				requested_at = excluded.requested_at,
				attempts = 0
		`;
	}

	markTreePending(itemId: string) {
		this.sql`
			WITH RECURSIVE search_tree(id) AS (
				SELECT ${itemId}
				UNION ALL
				SELECT i.id
				FROM kernel_items i
				JOIN search_tree parent ON i.parent_id = parent.id
				WHERE i.deleted_at IS NULL
			)
			INSERT INTO kernel_search_pending (item_id, requested_at, attempts)
			SELECT i.id, ${Date.now()}, 0
			FROM kernel_items i
			JOIN search_tree tree ON tree.id = i.id
			WHERE i.deleted_at IS NULL AND i.type IN ('document', 'file')
			ON CONFLICT(item_id) DO UPDATE SET
				requested_at = excluded.requested_at,
				attempts = 0
		`;
	}

	hasRetryablePending() {
		return Boolean(
			this.sql<{ item_id: string }>`
				SELECT item_id
				FROM kernel_search_pending
				WHERE attempts < ${maximumIndexAttempts}
				LIMIT 1
			`[0],
		);
	}

	async processBatch() {
		await this.flushVectorDeletes();
		const pending = this.sql<{ item_id: string }>`
			SELECT item_id
			FROM kernel_search_pending
			WHERE attempts < ${maximumIndexAttempts}
			ORDER BY requested_at ASC
			LIMIT ${searchIndexBatchSize}
		`;

		for (const row of pending) {
			try {
				await this.indexItem(row.item_id);
			} catch (error) {
				this.recordIndexFailure(row.item_id, error);
			}
		}

		await this.flushVectorDeletes();
		return this.hasRetryablePending();
	}

	async purgeVectors() {
		const ids = new Set(
			this.sql<{ vector_id: string }>`
				SELECT chunk_id AS vector_id FROM kernel_search_chunks
				UNION
				SELECT vector_id FROM kernel_search_vector_deletes
			`.map((row) => row.vector_id),
		);

		for (const batch of batchWorkspaceSearchValues(Array.from(ids), vectorDeleteBatchSize)) {
			await this.vectorize.deleteByIds(batch);
		}
	}

	private async indexItem(itemId: string) {
		const source = this.getIndexSource(itemId);
		if (!source) {
			this.removeIndexedItem(itemId);
			return;
		}

		const preparedChunks = await prepareWorkspaceSearchChunks({
			bucket: this.bucket,
			source,
			workspace: this.workspace,
		});
		if (!this.isCurrentSource(source)) {
			return;
		}

		const revisionKey = await sha256Base64UrlText(
			`${this.workspaceId()}:${source.itemId}:${source.sourceVersion}`,
		);
		const chunks: SearchIndexChunk[] = preparedChunks.map((chunk) => ({
			...chunk,
			chunkId: `s${revisionKey}-${chunk.index}`,
		}));
		this.replaceKeywordIndex({
			chunks,
			source,
		});

		const embeddings = await embedWorkspaceSearchTexts(
			this.ai,
			chunks.map((chunk) =>
				createWorkspaceSearchEmbeddingText({
					content: chunk.content,
					path: source.path,
					title: source.name,
				}),
			),
		);
		if (embeddings.length !== chunks.length) {
			throw new Error("Workspace search embedding response did not match the indexed chunks.");
		}

		const vectors = chunks.map(
			(chunk, index): VectorizeVector => ({
				id: chunk.chunkId,
				namespace: this.workspaceId(),
				values: embeddings[index] ?? [],
			}),
		);
		for (const batch of batchWorkspaceSearchValues(vectors, vectorMutationBatchSize)) {
			await this.vectorize.upsert(batch);
		}

		if (!this.isCurrentSource(source)) {
			for (const vector of vectors) {
				this.queueVectorDelete(vector.id);
			}
			return;
		}

		this.markVectorIndexReady(
			source,
			chunks.map((chunk) => chunk.chunkId),
		);
	}

	private getIndexSource(itemId: string): WorkspaceSearchIndexSource | null {
		const row = this.sql<SearchSourceRow>`
			SELECT
				i.id,
				i.type,
				i.name,
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

		const path = buildWorkspaceKernelItemPathIndex(this.getItems()).get(row.id);
		if (!path) {
			return null;
		}

		const source = {
			itemId: row.id,
			name: row.name,
			path,
		};

		if (row.type === "document") {
			return {
				...source,
				shellPath: row.shell_path,
				sourceVersion: `document:${row.updated_at}`,
				type: "document",
			};
		}
		if (!row.projection_object_key || !row.projection_source_hash) {
			return null;
		}

		return {
			...source,
			objectKey: row.projection_object_key,
			sourceHash: row.projection_source_hash,
			sourceVersion: `file:${row.updated_at}:${row.projection_updated_at}:${row.projection_source_hash}`,
			type: "file",
		};
	}

	private isCurrentSource(source: WorkspaceSearchIndexSource) {
		const current = this.getIndexSource(source.itemId);
		return (
			current?.sourceVersion === source.sourceVersion &&
			current.name === source.name &&
			current.path === source.path
		);
	}

	private replaceKeywordIndex(input: {
		chunks: SearchIndexChunk[];
		source: WorkspaceSearchIndexSource;
	}) {
		const retainedChunkIds = new Set(input.chunks.map((chunk) => chunk.chunkId));
		for (const row of this.sql<{ chunk_id: string }>`
			SELECT chunk_id
			FROM kernel_search_chunks
			WHERE item_id = ${input.source.itemId}
		`) {
			if (!retainedChunkIds.has(row.chunk_id)) {
				this.queueVectorDelete(row.chunk_id);
			}
		}

		this.deleteLocalChunks(input.source.itemId);
		for (const chunk of input.chunks) {
			this.insertChunk(input.source, chunk);
		}
		this.sql`
			INSERT INTO kernel_search_items (
				item_id,
				source_version,
				vector_ready
			)
			VALUES (
				${input.source.itemId},
				${input.source.sourceVersion},
				0
			)
			ON CONFLICT(item_id) DO UPDATE SET
				source_version = excluded.source_version,
				vector_ready = 0
		`;
	}

	private insertChunk(source: WorkspaceSearchIndexSource, chunk: SearchIndexChunk) {
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
			INSERT INTO kernel_search_fts (chunk_id, title, path, content)
			VALUES (${chunk.chunkId}, ${source.name}, ${source.path}, ${chunk.content})
		`;
	}

	private markVectorIndexReady(source: WorkspaceSearchIndexSource, vectorIds: readonly string[]) {
		this.sql`
			UPDATE kernel_search_items
			SET vector_ready = 1
			WHERE item_id = ${source.itemId} AND source_version = ${source.sourceVersion}
		`;
		this.sql`DELETE FROM kernel_search_pending WHERE item_id = ${source.itemId}`;
		if (vectorIds.length > 0) {
			this.sql`
				DELETE FROM kernel_search_vector_deletes
				WHERE vector_id IN (
					SELECT value FROM json_each(${JSON.stringify(vectorIds)})
				)
			`;
		}
	}

	private removeIndexedItem(itemId: string) {
		for (const row of this.sql<{ chunk_id: string }>`
			SELECT chunk_id
			FROM kernel_search_chunks
			WHERE item_id = ${itemId}
		`) {
			this.queueVectorDelete(row.chunk_id);
		}
		this.deleteLocalChunks(itemId);
		this.sql`DELETE FROM kernel_search_items WHERE item_id = ${itemId}`;
		this.sql`DELETE FROM kernel_search_pending WHERE item_id = ${itemId}`;
	}

	private deleteLocalChunks(itemId: string) {
		const chunkIds = this.sql<{ chunk_id: string }>`
			SELECT chunk_id
			FROM kernel_search_chunks
			WHERE item_id = ${itemId}
		`.map((row) => row.chunk_id);
		if (chunkIds.length > 0) {
			this.sql`
				DELETE FROM kernel_search_fts
				WHERE chunk_id IN (SELECT value FROM json_each(${JSON.stringify(chunkIds)}))
			`;
		}
		this.sql`DELETE FROM kernel_search_chunks WHERE item_id = ${itemId}`;
	}

	private queueVectorDelete(vectorId: string) {
		this.sql`
			INSERT INTO kernel_search_vector_deletes (vector_id, requested_at)
			VALUES (${vectorId}, ${Date.now()})
			ON CONFLICT(vector_id) DO NOTHING
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
			recordOperationalFailure({
				error,
				event: "workspace_search_vector_cleanup",
				fields: { workspace_id: this.workspaceId() },
			});
		}
	}

	private recordIndexFailure(itemId: string, error: unknown) {
		this.sql`
			UPDATE kernel_search_pending
			SET attempts = attempts + 1
			WHERE item_id = ${itemId}
		`;
		recordOperationalFailure({
			error,
			event: "workspace_search_indexing",
			fields: {
				item_id: itemId,
				workspace_id: this.workspaceId(),
			},
		});
	}
}
