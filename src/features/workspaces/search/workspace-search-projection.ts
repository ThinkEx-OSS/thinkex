import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";
import type { WorkspaceRealtimeEvent } from "#/features/workspaces/realtime/messages";
import type { WorkspaceSearchFileSystem } from "#/features/workspaces/search/workspace-search-content";
import type { WorkspaceSearchInput } from "#/features/workspaces/search/workspace-search-contract";
import { WorkspaceSearchIndexer } from "#/features/workspaces/search/workspace-search-indexer";
import { WorkspaceSearchQuery } from "#/features/workspaces/search/workspace-search-query";
import { initializeWorkspaceSearchStorage } from "#/features/workspaces/search/workspace-search-schema";

export class WorkspaceSearchProjection {
	private readonly indexer: WorkspaceSearchIndexer;
	private readonly query: WorkspaceSearchQuery;
	private readonly requestRun: () => void;
	private readonly sql: WorkspaceKernelSql;

	constructor(input: {
		ai: Ai;
		bucket: R2Bucket;
		getItems: () => WorkspaceItemSummary[];
		requestRun: () => void;
		sql: WorkspaceKernelSql;
		vectorize: VectorizeIndex;
		workspace: WorkspaceSearchFileSystem;
		workspaceId: () => string;
	}) {
		this.requestRun = input.requestRun;
		this.sql = input.sql;
		this.indexer = new WorkspaceSearchIndexer(input);
		this.query = new WorkspaceSearchQuery(input);
	}

	initialize() {
		initializeWorkspaceSearchStorage(this.sql);
		this.indexer.seedPendingItems();
	}

	observe(event: WorkspaceRealtimeEvent) {
		switch (event.type) {
			case "workspace.item.created":
				if (event.payload.item.type === "document") {
					this.indexer.markPending(event.payload.item.id);
				}
				break;
			case "workspace.item.content.updated":
				this.indexer.markPending(event.payload.item.id);
				break;
			case "workspace.item.renamed":
				if (event.payload.item.type === "document" || event.payload.item.type === "file") {
					this.indexer.markPending(event.payload.item.id);
				}
				break;
			case "workspace.item.moved":
				// Folder scope follows the live tree, so only moved content needs new metadata.
				if (event.payload.item.type === "document" || event.payload.item.type === "file") {
					this.indexer.markPending(event.payload.item.id);
				}
				break;
			case "workspace.items.moved":
				for (const item of event.payload.items) {
					if (item.type === "document" || item.type === "file") {
						this.indexer.markPending(item.id);
					}
				}
				break;
			case "workspace.item.projection.updated":
				for (const fact of event.payload.itemFacts) {
					this.indexer.markPending(fact.itemId);
				}
				break;
			case "workspace.item.deleted":
				for (const itemId of event.payload.deletedItemIds) {
					this.indexer.markPending(itemId);
				}
				break;
			case "workspace.item.color.updated":
			case "workspace.relations.updated":
				return;
			default:
				event satisfies never;
				return;
		}

		if (this.indexer.hasPending()) {
			this.requestRun();
		}
	}

	hasPending() {
		return this.indexer.hasPending();
	}

	async processBatch() {
		return await this.indexer.processBatch();
	}

	async search(input: WorkspaceSearchInput) {
		return await this.query.search(input);
	}

	async purgeVectors() {
		await this.indexer.purgeVectors();
	}
}
