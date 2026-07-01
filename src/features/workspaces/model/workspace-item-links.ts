import type { JsonValue, WorkspaceItemSummary } from "#/features/workspaces/contracts";

export const workspaceItemLinksMetadataKey = "links";

export interface WorkspaceItemLink {
	path: string;
	type: WorkspaceItemSummary["type"];
}

export function getWorkspaceItemLinkItemIds(metadataJson: Record<string, JsonValue>): string[] {
	const links = metadataJson[workspaceItemLinksMetadataKey];

	if (!Array.isArray(links)) {
		return [];
	}

	return uniqueStrings(links.filter((link): link is string => typeof link === "string"));
}

export function withWorkspaceItemLinksMetadata(
	metadataJson: Record<string, JsonValue>,
	linkItemIds: readonly string[],
): Record<string, JsonValue> {
	return {
		...metadataJson,
		[workspaceItemLinksMetadataKey]: uniqueStrings(linkItemIds),
	};
}

function uniqueStrings(values: readonly string[]) {
	const seen = new Set<string>();
	const result: string[] = [];

	for (const value of values) {
		if (seen.has(value)) {
			continue;
		}

		seen.add(value);
		result.push(value);
	}

	return result;
}
