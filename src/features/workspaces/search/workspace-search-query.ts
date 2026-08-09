import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import { buildWorkspaceKernelItemPathIndex } from "#/features/workspaces/kernel/workspace-kernel-paths";
import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";
import { resolveWorkspaceFileTypeFromItem } from "#/features/workspaces/model/workspace-file";
import type {
	WorkspaceSearchFailure,
	WorkspaceSearchInput,
	WorkspaceSearchItemType,
	WorkspaceSearchResult,
	WorkspaceSearchStatus,
} from "#/features/workspaces/search/workspace-search-contract";
import {
	isWorkspaceSearchableItemType,
	workspaceSearchableItemTypes,
} from "#/features/workspaces/workspace-item-registry";
import { batchWorkspaceSearchValues } from "#/features/workspaces/search/workspace-search-batches";
import { embedWorkspaceSearchTexts } from "#/features/workspaces/search/workspace-search-embeddings";
import {
	fuseWorkspaceSearchRanks,
	type WorkspaceSearchRankCandidate,
} from "#/features/workspaces/search/workspace-search-ranking";
import {
	resolveWorkspaceSearchScope,
	type WorkspaceSearchLocalScope,
	type WorkspaceSearchScope,
	type WorkspaceSearchVectorFilter,
} from "#/features/workspaces/search/workspace-search-scope";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";

const semanticQueryConcurrency = 4;
const maximumSemanticQueries = 16;
const workspaceSearchResultLimit = 10;

interface SearchChunkRow {
	chunk_id: string;
	content: string;
	end_line: number | null;
	item_id: string;
	page_number: number | null;
	start_line: number | null;
}

interface SearchCandidate extends WorkspaceSearchRankCandidate {
	content: string;
	endLine: number | null;
	pageNumber: number | null;
	startLine: number | null;
}

export class WorkspaceSearchQuery {
	private readonly ai: Ai;
	private readonly getItems: () => WorkspaceItemSummary[];
	private readonly sql: WorkspaceKernelSql;
	private readonly vectorize: VectorizeIndex;
	private readonly workspaceId: () => string;

	constructor(input: {
		ai: Ai;
		getItems: () => WorkspaceItemSummary[];
		sql: WorkspaceKernelSql;
		vectorize: VectorizeIndex;
		workspaceId: () => string;
	}) {
		this.ai = input.ai;
		this.getItems = input.getItems;
		this.sql = input.sql;
		this.vectorize = input.vectorize;
		this.workspaceId = input.workspaceId;
	}

	async search(input: WorkspaceSearchInput): Promise<{
		failed: WorkspaceSearchFailure[];
		results: WorkspaceSearchResult[];
		status: WorkspaceSearchStatus;
	}> {
		const status = this.getStatus();
		const types = input.types ?? [...workspaceSearchableItemTypes];
		const items = this.getItems();
		const resolvedScope = resolveWorkspaceSearchScope({
			items,
			path: input.path ?? "/",
			types,
		});
		if (resolvedScope.status === "failed") {
			return { failed: [resolvedScope.failure], results: [], status };
		}
		const { scope } = resolvedScope;
		const candidateLimit = workspaceSearchResultLimit * 6;
		const keyword = this.searchKeyword({
			candidateLimit,
			query: input.query,
			scope: scope.local,
			types,
		});
		const semantic = await this.searchSemanticWithFallback({
			candidateLimit,
			query: input.query,
			scope,
			types,
		});
		const itemsById = new Map(items.map((item) => [item.id, item]));
		const paths = buildWorkspaceKernelItemPathIndex(items);
		const ranked = fuseWorkspaceSearchRanks({
			keyword,
			limit: workspaceSearchResultLimit,
			semantic: semantic.candidates,
		});

		return {
			failed: [],
			status: semantic.degraded ? "partial" : status,
			results: ranked.flatMap((candidate) => {
				const path = paths.get(candidate.itemId);
				const item = itemsById.get(candidate.itemId);
				if (!path || !item) {
					return [];
				}
				const result = mapSearchResult(candidate, path, item, input.query);
				return result ? [result] : [];
			}),
		};
	}

	private getStatus(): WorkspaceSearchStatus {
		const unavailableFile = this.sql<{ item_id: string }>`
			SELECT i.id AS item_id
			FROM kernel_items i
			LEFT JOIN kernel_item_projections p
				ON p.item_id = i.id
				AND p.format = 'pages'
				AND p.status = 'ready'
				AND p.object_key IS NOT NULL
				AND p.source_hash IS NOT NULL
			WHERE i.deleted_at IS NULL
				AND i.type = 'file'
				AND p.item_id IS NULL
			LIMIT 1
		`[0];
		if (unavailableFile) {
			return "partial";
		}

		const pending = this.sql<{ item_id: string }>`
			SELECT item_id FROM kernel_search_pending LIMIT 1
		`[0];
		if (pending) {
			return "indexing";
		}

		const failed = this.sql<{ item_id: string }>`
			SELECT item_id
			FROM kernel_search_items
			WHERE vector_status = 'failed'
			LIMIT 1
		`[0];
		return failed ? "partial" : "ready";
	}

	private async searchSemanticWithFallback(input: {
		candidateLimit: number;
		query: string;
		scope: WorkspaceSearchScope;
		types: WorkspaceSearchItemType[];
	}) {
		try {
			return await this.searchSemantic(input);
		} catch (error) {
			recordOperationalFailure({
				error,
				event: "workspace_search_semantic",
				fields: { workspace_id: this.workspaceId() },
			});
			return { candidates: [], degraded: true };
		}
	}

	private searchKeyword(input: {
		candidateLimit: number;
		query: string;
		scope: WorkspaceSearchLocalScope;
		types: WorkspaceSearchItemType[];
	}): SearchCandidate[] {
		const match = createFtsMatchExpression(input.query);
		if (!match) {
			return [];
		}

		const localScope = serializeWorkspaceSearchLocalScope(input.scope);
		const typesJson = JSON.stringify(input.types);
		const rows = this.sql<SearchChunkRow>`
			SELECT
				c.chunk_id,
				c.item_id,
				kernel_search_fts.content,
				c.page_number,
				c.start_line,
				c.end_line
			FROM kernel_search_fts
			JOIN kernel_search_chunks c ON c.rowid = kernel_search_fts.rowid
			JOIN kernel_items i ON i.id = c.item_id AND i.deleted_at IS NULL
			JOIN kernel_search_items s ON s.item_id = c.item_id
			WHERE kernel_search_fts MATCH ${match}
				AND s.vector_status IN ('ready', 'failed')
				AND NOT EXISTS (
					SELECT 1
					FROM kernel_search_pending pending
					WHERE pending.item_id = i.id
				)
				AND (
					${localScope.kind} = 'workspace'
					OR (
						${localScope.kind} = 'item'
						AND c.item_id IN (SELECT value FROM json_each(${localScope.idsJson}))
					)
					OR (
						${localScope.kind} = 'folder'
						AND i.parent_id IN (SELECT value FROM json_each(${localScope.idsJson}))
					)
				)
				AND i.type IN (SELECT value FROM json_each(${typesJson}))
			ORDER BY bm25(kernel_search_fts, 8.0, 1.0) ASC
			LIMIT ${input.candidateLimit}
		`;

		return rows.map(mapSearchCandidate);
	}

	private async searchSemantic(input: {
		candidateLimit: number;
		query: string;
		scope: WorkspaceSearchScope;
		types: WorkspaceSearchItemType[];
	}) {
		if (input.scope.vectorFilters.length === 0) {
			return { candidates: [], degraded: false };
		}
		const [embedding] = await embedWorkspaceSearchTexts(this.ai, [input.query]);
		if (!embedding) {
			throw new Error("Workspace search embedding response did not include the query vector.");
		}

		const semanticMatches = await this.querySemanticMatches({
			candidateLimit: input.candidateLimit,
			embedding,
			filters: input.scope.vectorFilters,
		});
		const { matches } = semanticMatches;
		const vectorIds = matches.map((match) => match.id);
		if (vectorIds.length === 0) {
			return { candidates: [], degraded: semanticMatches.degraded };
		}

		const rows = this.loadSemanticCandidates({
			scope: input.scope.local,
			types: input.types,
			vectorIds,
		});
		const byVectorId = new Map(rows.map((row) => [row.chunk_id, mapSearchCandidate(row)]));

		return {
			candidates: vectorIds.flatMap((vectorId) => {
				const candidate = byVectorId.get(vectorId);
				return candidate ? [candidate] : [];
			}),
			degraded: semanticMatches.degraded,
		};
	}

	private async querySemanticMatches(input: {
		candidateLimit: number;
		embedding: number[];
		filters: WorkspaceSearchVectorFilter[];
	}) {
		let bestMatches = new Map<string, VectorizeMatch>();
		const filters = input.filters.slice(0, maximumSemanticQueries);

		for (const filterBatch of batchWorkspaceSearchValues(filters, semanticQueryConcurrency)) {
			const results = await Promise.all(
				filterBatch.map((filter) =>
					this.vectorize.query(input.embedding, {
						...(filter ? { filter } : {}),
						namespace: this.workspaceId(),
						returnMetadata: "none",
						topK: input.candidateLimit,
					}),
				),
			);

			for (const match of results.flatMap((result) => result.matches)) {
				const existing = bestMatches.get(match.id);
				if (!existing || match.score > existing.score) {
					bestMatches.set(match.id, match);
				}
			}
			bestMatches = new Map(
				Array.from(bestMatches.values())
					.sort(compareSemanticMatches)
					.slice(0, input.candidateLimit)
					.map((match) => [match.id, match]),
			);
		}

		return {
			degraded: filters.length < input.filters.length,
			matches: Array.from(bestMatches.values()).sort(compareSemanticMatches),
		};
	}

	private loadSemanticCandidates(input: {
		scope: WorkspaceSearchLocalScope;
		types: WorkspaceSearchItemType[];
		vectorIds: string[];
	}) {
		const localScope = serializeWorkspaceSearchLocalScope(input.scope);
		const typesJson = JSON.stringify(input.types);

		return this.sql<SearchChunkRow>`
			SELECT
				c.chunk_id,
				c.item_id,
				kernel_search_fts.content,
				c.page_number,
				c.start_line,
				c.end_line
			FROM kernel_search_chunks c
			JOIN kernel_search_fts ON kernel_search_fts.rowid = c.rowid
			JOIN kernel_items i ON i.id = c.item_id AND i.deleted_at IS NULL
			JOIN kernel_search_items s ON s.item_id = c.item_id AND s.vector_status = 'ready'
			WHERE c.chunk_id IN (SELECT value FROM json_each(${JSON.stringify(input.vectorIds)}))
				AND NOT EXISTS (
					SELECT 1
					FROM kernel_search_pending pending
					WHERE pending.item_id = i.id
				)
				AND (
					${localScope.kind} = 'workspace'
					OR (
						${localScope.kind} = 'item'
						AND c.item_id IN (SELECT value FROM json_each(${localScope.idsJson}))
					)
					OR (
						${localScope.kind} = 'folder'
						AND i.parent_id IN (SELECT value FROM json_each(${localScope.idsJson}))
					)
				)
				AND i.type IN (SELECT value FROM json_each(${typesJson}))
		`;
	}
}

function serializeWorkspaceSearchLocalScope(scope: WorkspaceSearchLocalScope) {
	return {
		idsJson: JSON.stringify(
			scope.kind === "workspace" ? [] : scope.kind === "item" ? [scope.itemId] : scope.folderIds,
		),
		kind: scope.kind,
	};
}

function compareSemanticMatches(left: VectorizeMatch, right: VectorizeMatch) {
	return right.score - left.score || left.id.localeCompare(right.id);
}

function mapSearchCandidate(row: SearchChunkRow): SearchCandidate {
	return {
		chunkId: row.chunk_id,
		content: row.content,
		endLine: row.end_line,
		itemId: row.item_id,
		pageNumber: row.page_number,
		startLine: row.start_line,
	};
}

function mapSearchResult(
	candidate: SearchCandidate,
	path: string,
	item: WorkspaceItemSummary,
	query: string,
): WorkspaceSearchResult | null {
	if (!isWorkspaceSearchableItemType(item.type)) {
		return null;
	}
	const fileType = item.type === "file" ? resolveWorkspaceFileTypeFromItem(item) : null;

	return {
		...(fileType ? { assetKind: fileType.assetKind } : {}),
		excerpt: createSearchExcerpt(candidate.content, query),
		itemId: candidate.itemId,
		location:
			candidate.pageNumber === null
				? {
						endLine: candidate.endLine ?? 0,
						kind: "lines",
						startLine: candidate.startLine ?? 0,
					}
				: {
						kind: "page",
						pageNumber: candidate.pageNumber,
					},
		path,
		title: item.name,
		type: item.type,
	};
}

// AND, not OR: the semantic branch is the recall net, so the lexical branch is
// free to be precise. It also makes the query pick its own engine — literal
// lookups ("acme invoice 4417") match here, while natural-language questions
// match no single chunk, return nothing, and are answered by semantic alone.
export function createFtsMatchExpression(query: string) {
	const tokens = getSearchQueryTokens(query);
	return tokens.length > 0
		? tokens.map((token) => `"${token.replaceAll('"', '""')}"*`).join(" AND ")
		: null;
}

function createSearchExcerpt(content: string, query: string) {
	const maximumLength = 700;
	if (content.length <= maximumLength) {
		return content;
	}

	const normalizedContent = content.toLocaleLowerCase();
	const matchIndex = getSearchQueryTokens(query).reduce((earliest, token) => {
		const index = normalizedContent.indexOf(token.toLocaleLowerCase());
		return index === -1 || (earliest !== -1 && earliest <= index) ? earliest : index;
	}, -1);
	const start = Math.max(0, (matchIndex === -1 ? 0 : matchIndex) - Math.floor(maximumLength / 3));
	const end = Math.min(content.length, start + maximumLength);

	return `${start > 0 ? "…" : ""}${content.slice(start, end).trim()}${end < content.length ? "…" : ""}`;
}

function getSearchQueryTokens(query: string) {
	return query.match(/[\p{L}\p{N}_]+/gu)?.slice(0, 20) ?? [];
}
