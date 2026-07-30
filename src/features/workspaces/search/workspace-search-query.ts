import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import {
	buildWorkspaceKernelItemPathIndex,
	buildWorkspaceKernelTree,
	normalizeWorkspacePath,
	resolveWorkspaceKernelItemPath,
	WorkspaceKernelPathError,
	type WorkspaceKernelTree,
} from "#/features/workspaces/kernel/workspace-kernel-paths";
import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";
import { resolveWorkspaceFileTypeFromItem } from "#/features/workspaces/model/workspace-file";
import type {
	WorkspaceSearchFailure,
	WorkspaceSearchInput,
	WorkspaceSearchItemType,
	WorkspaceSearchResult,
} from "#/features/workspaces/search/workspace-search-contract";
import { embedWorkspaceSearchTexts } from "#/features/workspaces/search/workspace-search-embeddings";
import {
	fuseWorkspaceSearchRanks,
	type WorkspaceSearchRankCandidate,
} from "#/features/workspaces/search/workspace-search-ranking";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";

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

	async search(
		input: WorkspaceSearchInput,
	): Promise<{ failed: WorkspaceSearchFailure[]; results: WorkspaceSearchResult[] }> {
		const scope = this.resolveScope(input.path ?? "/");
		if (scope.status === "failed") {
			return { failed: [scope.failure], results: [] };
		}

		const limit = input.limit ?? 10;
		const types = input.types ?? ["document", "file"];
		const candidateLimit = Math.min(100, Math.max(50, limit * 6));
		const keyword = this.searchKeyword({
			candidateLimit,
			query: input.query,
			scopeItemIds: scope.itemIds,
			types,
		});
		const semantic = await this.searchSemanticWithFallback({
			candidateLimit,
			query: input.query,
			scopeItemIds: scope.itemIds,
			types,
		});
		const items = this.getItems();
		const itemsById = new Map(items.map((item) => [item.id, item]));
		const paths = buildWorkspaceKernelItemPathIndex(items);
		const ranked = fuseWorkspaceSearchRanks({ keyword, limit, semantic });

		return {
			failed: [],
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

	private async searchSemanticWithFallback(input: {
		candidateLimit: number;
		query: string;
		scopeItemIds: string[] | null;
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
			return [];
		}
	}

	private resolveScope(
		requestedPath: string,
	):
		| { itemIds: string[] | null; status: "ready" }
		| { failure: WorkspaceSearchFailure; status: "failed" } {
		let path: string;
		try {
			path = normalizeWorkspacePath(requestedPath);
		} catch (error) {
			if (error instanceof WorkspaceKernelPathError && error.code === "path_not_absolute") {
				return {
					failure: { code: error.code, path: requestedPath },
					status: "failed",
				};
			}
			throw error;
		}

		if (path === "/") {
			return { itemIds: null, status: "ready" };
		}

		const items = this.getItems();
		const tree = buildWorkspaceKernelTree(items);
		const item = resolveWorkspaceKernelItemPath(path, tree);
		if (!item) {
			return {
				failure: { code: "path_not_found", path },
				status: "failed",
			};
		}
		if (item.type !== "folder") {
			return { itemIds: [item.id], status: "ready" };
		}

		return { itemIds: listDescendantItemIds(item.id, tree), status: "ready" };
	}

	private searchKeyword(input: {
		candidateLimit: number;
		query: string;
		scopeItemIds: string[] | null;
		types: WorkspaceSearchItemType[];
	}): SearchCandidate[] {
		const match = createFtsMatchExpression(input.query);
		if (!match) {
			return [];
		}

		const scopeJson = input.scopeItemIds ? JSON.stringify(input.scopeItemIds) : null;
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
			JOIN kernel_search_chunks c ON c.chunk_id = kernel_search_fts.chunk_id
			JOIN kernel_items i ON i.id = c.item_id AND i.deleted_at IS NULL
			JOIN kernel_search_items s ON s.item_id = c.item_id
			LEFT JOIN kernel_item_projections p
				ON p.item_id = i.id
				AND p.format = 'pages'
				AND p.status = 'ready'
			WHERE kernel_search_fts MATCH ${match}
				AND s.source_version = CASE
					WHEN i.type = 'document' THEN 'document:' || i.updated_at
					ELSE 'file:' || i.updated_at || ':' || p.updated_at || ':' || p.source_hash
				END
				AND (${scopeJson} IS NULL OR c.item_id IN (
					SELECT value FROM json_each(${scopeJson})
				))
				AND i.type IN (SELECT value FROM json_each(${typesJson}))
			ORDER BY bm25(kernel_search_fts, 0.0, 8.0, 4.0, 1.0) ASC
			LIMIT ${input.candidateLimit}
		`;

		return rows.map(mapSearchCandidate);
	}

	private async searchSemantic(input: {
		candidateLimit: number;
		query: string;
		scopeItemIds: string[] | null;
		types: WorkspaceSearchItemType[];
	}): Promise<SearchCandidate[]> {
		const [embedding] = await embedWorkspaceSearchTexts(this.ai, [input.query]);
		if (!embedding) {
			return [];
		}

		const matches = await this.vectorize.query(embedding, {
			namespace: this.workspaceId(),
			returnMetadata: "none",
			topK: input.candidateLimit,
		});
		const vectorIds = matches.matches.map((match) => match.id);
		if (vectorIds.length === 0) {
			return [];
		}

		const rows = this.loadSemanticCandidates({
			scopeItemIds: input.scopeItemIds,
			types: input.types,
			vectorIds,
		});
		const byVectorId = new Map(rows.map((row) => [row.chunk_id, mapSearchCandidate(row)]));

		return vectorIds.flatMap((vectorId) => {
			const candidate = byVectorId.get(vectorId);
			return candidate ? [candidate] : [];
		});
	}

	private loadSemanticCandidates(input: {
		scopeItemIds: string[] | null;
		types: WorkspaceSearchItemType[];
		vectorIds: string[];
	}) {
		const scopeJson = input.scopeItemIds ? JSON.stringify(input.scopeItemIds) : null;
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
			JOIN kernel_search_fts ON kernel_search_fts.chunk_id = c.chunk_id
			JOIN kernel_items i ON i.id = c.item_id AND i.deleted_at IS NULL
			JOIN kernel_search_items s ON s.item_id = c.item_id AND s.vector_ready = 1
			LEFT JOIN kernel_item_projections p
				ON p.item_id = i.id
				AND p.format = 'pages'
				AND p.status = 'ready'
			WHERE c.chunk_id IN (SELECT value FROM json_each(${JSON.stringify(input.vectorIds)}))
				AND s.source_version = CASE
					WHEN i.type = 'document' THEN 'document:' || i.updated_at
					ELSE 'file:' || i.updated_at || ':' || p.updated_at || ':' || p.source_hash
				END
				AND (${scopeJson} IS NULL OR c.item_id IN (
					SELECT value FROM json_each(${scopeJson})
				))
				AND i.type IN (SELECT value FROM json_each(${typesJson}))
		`;
	}
}

function listDescendantItemIds(folderId: string, tree: WorkspaceKernelTree) {
	const ids: string[] = [];
	const pending = [folderId];
	while (pending.length > 0) {
		const itemId = pending.pop();
		if (itemId) {
			ids.push(itemId);
			pending.push(...(tree.childrenByParentId.get(itemId) ?? []).map((item) => item.id));
		}
	}
	return ids;
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
	if (item.type !== "document" && item.type !== "file") {
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

function createFtsMatchExpression(query: string) {
	const tokens = query.match(/[\p{L}\p{N}_]+/gu)?.slice(0, 20) ?? [];
	return tokens.length > 0
		? tokens.map((token) => `"${token.replaceAll('"', '""')}"*`).join(" OR ")
		: null;
}

function createSearchExcerpt(content: string, query: string) {
	const maximumLength = 700;
	if (content.length <= maximumLength) {
		return content;
	}

	const term = query.match(/[\p{L}\p{N}_]{3,}/u)?.[0]?.toLocaleLowerCase();
	const matchIndex = term ? content.toLocaleLowerCase().indexOf(term) : -1;
	const start = Math.max(0, (matchIndex === -1 ? 0 : matchIndex) - Math.floor(maximumLength / 3));
	const end = Math.min(content.length, start + maximumLength);

	return `${start > 0 ? "…" : ""}${content.slice(start, end).trim()}${end < content.length ? "…" : ""}`;
}
