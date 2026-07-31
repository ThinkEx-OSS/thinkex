/**
 * Bump whenever the embedding model, chunking, or embedding text format changes.
 * The SQL freshness checks in the indexer and query must mirror the format built here.
 */
export const workspaceSearchIndexVersion = "v3-bge-m3-1800-scoped";

export function buildWorkspaceSearchSourceVersion(
	input:
		| { type: "document"; updatedAt: number }
		| {
				projectionUpdatedAt: number;
				sourceHash: string;
				type: "file";
				updatedAt: number;
		  },
) {
	return input.type === "document"
		? `${workspaceSearchIndexVersion}:document:${input.updatedAt}`
		: `${workspaceSearchIndexVersion}:file:${input.updatedAt}:${input.projectionUpdatedAt}:${input.sourceHash}`;
}
