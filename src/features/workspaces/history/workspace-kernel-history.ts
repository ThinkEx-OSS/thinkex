import { workspaceItemTypeSchema } from "#/features/workspaces/contracts";
import type {
	WorkspaceHistoryEntry,
	WorkspaceHistoryItem,
	WorkspaceHistoryOrigin,
} from "#/features/workspaces/history/workspace-history-contract";
import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";
import type { WorkspaceRealtimeEvent } from "#/features/workspaces/realtime/messages";
import { sha256Base64UrlText } from "#/lib/binary";

interface WorkspaceItemVersionRow {
	content_hash: string;
	content_type: string;
	created_at: number;
	event_id: string;
	id: string;
	item_id: string;
	item_type: string;
	object_key: string;
	previous_content_hash: string | null;
	previous_object_key: string | null;
	revision: number;
}

interface WorkspaceItemVersionStateRow extends WorkspaceItemVersionRow {
	deleted_at: number | null;
}

interface WorkspaceEventHistoryRow {
	actor_user_id: string | null;
	created_at: number;
	group_id: string | null;
	id: string;
	origin: WorkspaceHistoryOrigin;
	payload_json: string;
	revision: number;
	thread_id: string | null;
	type: string;
	version_id: string | null;
}

interface PreparedWorkspaceContent {
	contentHash: string;
	contentType: string;
	objectKey: string;
}

export class WorkspaceKernelHistory {
	constructor(
		private readonly sql: WorkspaceKernelSql,
		private readonly r2: R2Bucket,
		private readonly workspaceId: () => string,
	) {}

	async prepareContent(
		itemId: string,
		content: string,
		contentType: string,
		contentHash?: string,
	): Promise<PreparedWorkspaceContent> {
		const resolvedContentHash = contentHash ?? (await sha256Base64UrlText(content));
		const objectKey = `workspace_history/${this.workspaceId()}/${itemId}/${resolvedContentHash}`;
		await this.r2.put(objectKey, content, { httpMetadata: { contentType } });
		return { contentHash: resolvedContentHash, contentType, objectKey };
	}

	private async readContent(objectKey: string) {
		const object = await this.r2.get(objectKey);
		if (!object?.body) {
			throw new Error("Workspace history content is missing.");
		}
		return await object.text();
	}

	private getLatestVersion(itemId: string) {
		return (
			this.sql<WorkspaceItemVersionRow>`
				SELECT * FROM workspace_item_versions
				WHERE item_id = ${itemId}
				ORDER BY revision DESC
				LIMIT 1
			`[0] ?? null
		);
	}

	getLatestVersionContent(itemId: string): PreparedWorkspaceContent | null {
		const latest = this.getLatestVersion(itemId);
		return latest
			? {
					contentHash: latest.content_hash,
					contentType: latest.content_type,
					objectKey: latest.object_key,
				}
			: null;
	}

	async planVersion(input: {
		content: string;
		contentChanged: boolean;
		itemId: string;
	}): Promise<{ shouldCreate: false } | { contentHash: string; shouldCreate: true }> {
		const latest = this.getLatestVersion(input.itemId);
		const contentHash = await sha256Base64UrlText(input.content);
		return !input.contentChanged && latest?.content_hash === contentHash
			? { shouldCreate: false }
			: { contentHash, shouldCreate: true };
	}

	insertVersion(input: {
		content: PreparedWorkspaceContent;
		event: WorkspaceRealtimeEvent;
		itemId: string;
		itemType: string;
		previous: PreparedWorkspaceContent | null;
		versionId: string;
	}) {
		this.sql`
			INSERT INTO workspace_item_versions (
				id, item_id, item_type, revision, event_id,
				object_key, content_hash, content_type,
				previous_object_key, previous_content_hash,
				created_at
			)
			VALUES (
				${input.versionId}, ${input.itemId}, ${input.itemType},
				${input.event.revision}, ${input.event.id},
				${input.content.objectKey}, ${input.content.contentHash}, ${input.content.contentType},
				${input.previous?.objectKey ?? null}, ${input.previous?.contentHash ?? null},
				${Date.parse(input.event.createdAt)}
			)
		`;
	}

	async readVersionChange(input: {
		versionIds: string[];
	}): Promise<
		| { beforeContent: string; expectedCurrentHash: string; status: "ready" }
		| { status: "not_found" | "not_latest" | "review_unavailable" }
	> {
		if (
			input.versionIds.length === 0 ||
			new Set(input.versionIds).size !== input.versionIds.length
		) {
			return { status: "not_found" };
		}
		const rows = input.versionIds.map((versionId) => this.getVersion(versionId));
		if (rows.some((row) => !row)) return { status: "not_found" };
		const versions = rows as WorkspaceItemVersionRow[];
		for (let index = 1; index < versions.length; index += 1) {
			if (
				versions[index]?.item_id !== versions[0]?.item_id ||
				versions[index]?.previous_content_hash !== versions[index - 1]?.content_hash
			) {
				return { status: "not_latest" };
			}
		}
		const first = versions[0];
		const last = versions.at(-1);
		if (!first || !last) return { status: "not_found" };
		if (first.item_type === "file") return { status: "review_unavailable" };
		if (!first.previous_object_key) return { status: "review_unavailable" };
		return {
			beforeContent: await this.readContent(first.previous_object_key),
			expectedCurrentHash: last.content_hash,
			status: "ready",
		};
	}

	async readVersion(input: { itemId: string; versionId: string }) {
		const version =
			this.sql<WorkspaceItemVersionStateRow>`
				SELECT v.*, i.deleted_at
				FROM workspace_item_versions v
				LEFT JOIN kernel_items i ON i.id = v.item_id
				WHERE v.id = ${input.versionId}
				LIMIT 1
			`[0] ?? null;
		if (!version || version.item_id !== input.itemId) return { status: "not_found" as const };
		if (version.item_type === "file") return { status: "review_unavailable" as const };
		const [content, beforeContent] = await Promise.all([
			this.readContent(version.object_key),
			version.previous_object_key ? this.readContent(version.previous_object_key) : null,
		]);
		return {
			beforeContent,
			canRestore: version.deleted_at === null,
			content,
			itemId: version.item_id,
			itemType: version.item_type,
			status: "ready" as const,
		};
	}

	list(input: { beforeRevision?: number; limit?: number } = {}) {
		const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
		const beforeRevision = input.beforeRevision ?? Number.MAX_SAFE_INTEGER;
		const rows = this.sql<WorkspaceEventHistoryRow>`
			SELECT e.*, v.id AS version_id
			FROM kernel_events e
			LEFT JOIN workspace_item_versions v ON v.event_id = e.id
			WHERE e.revision < ${beforeRevision}
				AND e.type <> 'workspace.item.projection.updated'
			ORDER BY e.revision DESC
			LIMIT ${limit}
		`;
		return rows.map(mapHistoryRow);
	}

	private getVersion(versionId: string) {
		return (
			this.sql<WorkspaceItemVersionRow>`
				SELECT * FROM workspace_item_versions WHERE id = ${versionId} LIMIT 1
			`[0] ?? null
		);
	}
}

function mapHistoryRow(row: WorkspaceEventHistoryRow): Omit<WorkspaceHistoryEntry, "actor"> {
	return {
		actorUserId: row.actor_user_id,
		createdAt: new Date(row.created_at).toISOString(),
		groupId: row.group_id,
		id: row.id,
		items: readHistoryItems(row.payload_json),
		origin: row.origin,
		revision: row.revision,
		threadId: row.thread_id,
		type: row.type,
		versionId: row.version_id,
	};
}

function readHistoryItems(payloadJson: string): WorkspaceHistoryItem[] {
	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(payloadJson) as Record<string, unknown>;
	} catch {
		return [];
	}
	const candidates = [payload.item, ...(Array.isArray(payload.items) ? payload.items : [])];
	return candidates.flatMap((candidate) => {
		if (!candidate || typeof candidate !== "object") return [];
		const item = candidate as Record<string, unknown>;
		const parsedType = workspaceItemTypeSchema.safeParse(item.type);
		return typeof item.id === "string" && typeof item.name === "string" && parsedType.success
			? [{ id: item.id, name: item.name, type: parsedType.data }]
			: [];
	});
}
