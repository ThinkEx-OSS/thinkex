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
			case "workspace.item.moved":
				this.indexer.markTreePending(event.payload.item.id);
				break;
			case "workspace.items.moved":
				for (const item of event.payload.items) {
					this.indexer.markTreePending(item.id);
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
		}

		if (this.indexer.hasRetryablePending()) {
			this.requestRun();
		}
	}

	hasRetryablePending() {
		return this.indexer.hasRetryablePending();
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
