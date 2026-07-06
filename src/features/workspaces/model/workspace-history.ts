import type { JsonValue } from "#/features/workspaces/contracts";

export const workspaceHistoryDefaultPageSize = 50;
export const workspaceHistoryMaxPageSize = 100;
export const workspaceHistoryBurstWindowMs = 5 * 60_000;

export interface WorkspaceHistoryEvent {
	id: string;
	revision: number;
	workspaceId: string;
	type: string;
	actorUserId: string | null;
	clientMutationId: string | null;
	createdAt: string;
	// JsonValue rather than unknown so the type survives server-function
	// serialization; consumers still treat it as untrusted.
	payload: JsonValue;
}

export interface WorkspaceHistoryPage {
	events: WorkspaceHistoryEvent[];
	nextBeforeRevision: number | null;
}

export type WorkspaceHistoryEntryKind =
	| "created"
	| "renamed"
	| "moved"
	| "color"
	| "edited"
	| "deleted"
	| "change";

export interface WorkspaceHistoryEntry {
	id: string;
	revision: number;
	createdAt: string;
	actorUserId: string | null;
	kind: WorkspaceHistoryEntryKind;
	summary: string;
	eventCount: number;
}

interface WorkspaceHistoryPayloadItem {
	id: string;
	name: string;
	type?: string | null;
}

/**
 * Maps newest-first kernel event records into readable timeline entries,
 * coalescing bursts of consecutive content edits to the same item by the
 * same actor. Unknown event types and malformed payloads degrade to a
 * generic "made a change" entry instead of failing the timeline.
 */
export function mapWorkspaceHistoryEvents(
	events: readonly WorkspaceHistoryEvent[],
	options: { burstWindowMs?: number } = {},
): WorkspaceHistoryEntry[] {
	const burstWindowMs = options.burstWindowMs ?? workspaceHistoryBurstWindowMs;
	const groups: WorkspaceHistoryEvent[][] = [];

	for (const event of events) {
		const group = groups[groups.length - 1];

		if (group && extendsEditBurst(group[group.length - 1], event, burstWindowMs)) {
			group.push(event);
			continue;
		}

		groups.push([event]);
	}

	return groups.map(mapWorkspaceHistoryEventGroup);
}

function extendsEditBurst(
	previous: WorkspaceHistoryEvent,
	event: WorkspaceHistoryEvent,
	burstWindowMs: number,
) {
	if (
		previous.type !== "workspace.item.content.updated" ||
		event.type !== "workspace.item.content.updated" ||
		event.actorUserId !== previous.actorUserId
	) {
		return false;
	}

	const previousItem = getPayloadItem(previous.payload);
	const item = getPayloadItem(event.payload);

	if (!previousItem || !item || previousItem.id !== item.id) {
		return false;
	}

	const gapMs = Date.parse(previous.createdAt) - Date.parse(event.createdAt);

	return Number.isFinite(gapMs) && gapMs <= burstWindowMs;
}

function mapWorkspaceHistoryEventGroup(group: WorkspaceHistoryEvent[]): WorkspaceHistoryEntry {
	const newest = group[0];
	const { kind, summary } = describeWorkspaceHistoryEvent(newest);

	return {
		id: newest.id,
		revision: newest.revision,
		createdAt: newest.createdAt,
		actorUserId: newest.actorUserId,
		kind,
		summary: group.length > 1 ? `${summary} (${group.length} changes)` : summary,
		eventCount: group.length,
	};
}

function describeWorkspaceHistoryEvent(event: WorkspaceHistoryEvent): {
	kind: WorkspaceHistoryEntryKind;
	summary: string;
} {
	switch (event.type) {
		case "workspace.item.created": {
			const item = getPayloadItem(event.payload);
			return {
				kind: "created",
				summary: item ? `created ${getItemTypeWord(item)} “${item.name}”` : "created an item",
			};
		}
		case "workspace.item.renamed": {
			const item = getPayloadItem(event.payload);
			return {
				kind: "renamed",
				summary: item ? `renamed ${getItemTypeWord(item)} to “${item.name}”` : "renamed an item",
			};
		}
		case "workspace.item.moved": {
			const item = getPayloadItem(event.payload);
			return {
				kind: "moved",
				summary: item ? `moved “${item.name}”` : "moved an item",
			};
		}
		case "workspace.items.moved": {
			const items = getPayloadItems(event.payload);

			if (items.length === 1) {
				return { kind: "moved", summary: `moved “${items[0].name}”` };
			}

			return {
				kind: "moved",
				summary: items.length > 0 ? `moved ${items.length} items` : "moved items",
			};
		}
		case "workspace.item.color.updated": {
			const item = getPayloadItem(event.payload);
			return {
				kind: "color",
				summary: item ? `changed the color of “${item.name}”` : "changed an item's color",
			};
		}
		case "workspace.item.content.updated": {
			const item = getPayloadItem(event.payload);
			return {
				kind: "edited",
				summary: item ? `edited “${item.name}”` : "edited an item",
			};
		}
		case "workspace.item.deleted": {
			const itemIds = getPayloadItemIds(event.payload);

			if (itemIds.length === 1) {
				return { kind: "deleted", summary: "deleted an item" };
			}

			return {
				kind: "deleted",
				summary: itemIds.length > 0 ? `deleted ${itemIds.length} items` : "deleted items",
			};
		}
		default:
			return { kind: "change", summary: "made a change" };
	}
}

function getItemTypeWord(item: WorkspaceHistoryPayloadItem) {
	switch (item.type) {
		case "folder":
			return "folder";
		case "document":
			return "document";
		case "file":
			return "file";
		case "flashcard":
			return "flashcards";
		case "quiz":
			return "quiz";
		default:
			return "item";
	}
}

function getPayloadItem(payload: unknown): WorkspaceHistoryPayloadItem | null {
	const item = (payload as { item?: unknown } | null)?.item;

	return isItemLike(item) ? item : null;
}

function getPayloadItems(payload: unknown): WorkspaceHistoryPayloadItem[] {
	const items = (payload as { items?: unknown } | null)?.items;

	if (!Array.isArray(items)) {
		return [];
	}

	return items.filter(isItemLike);
}

function getPayloadItemIds(payload: unknown) {
	const itemIds = (payload as { itemIds?: unknown } | null)?.itemIds;

	if (!Array.isArray(itemIds)) {
		return [];
	}

	return itemIds.filter((itemId): itemId is string => typeof itemId === "string");
}

function isItemLike(value: unknown): value is WorkspaceHistoryPayloadItem {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { id?: unknown }).id === "string" &&
		typeof (value as { name?: unknown }).name === "string"
	);
}
