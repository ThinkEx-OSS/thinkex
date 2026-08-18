import { readWorkspacePageProjection } from "#/features/workspaces/extraction/workspace-page-projection";
import { resolveWorkspaceProjectionReadiness } from "#/features/workspaces/extraction/workspace-projection-readiness";
import { readWorkspaceFileExtraction } from "#/features/workspaces/persistence/workspace-files";

const IMAGE_DESCRIPTION_MAX_CHARACTERS = 300;

// Matches only up to the id, never the whole tag: our serializer emits
// data-item-id as the first attribute, and a later alt attribute may contain
// characters (like ">") that would break a full-tag pattern.
const imageItemIdPattern = /<img\b[^>]*?\bdata-item-id="([^"]+)"/g;

export interface WorkspaceImageDescription {
	itemId: string;
	description: string;
}

/**
 * Looks up the stored description of every workspace image embedded in the
 * given HTML strings, so reads can return them beside the content. The HTML
 * itself is never rewritten — it is the byte-exact anchor replace_text edits
 * match against. Images whose extraction has not finished are omitted.
 */
export async function collectWorkspaceImageDescriptions(
	htmls: readonly string[],
	input: { workspaceId: string },
): Promise<WorkspaceImageDescription[]> {
	const itemIds = new Set<string>();
	for (const html of htmls) {
		for (const match of html.matchAll(imageItemIdPattern)) {
			if (match[1]) itemIds.add(match[1]);
		}
	}
	if (itemIds.size === 0) {
		return [];
	}

	const descriptions = await Promise.all(
		Array.from(itemIds, async (itemId) => {
			const description = await readImageDescription(itemId, input.workspaceId);
			return description ? [{ itemId, description }] : [];
		}),
	);
	return descriptions.flat();
}

async function readImageDescription(itemId: string, workspaceId: string) {
	try {
		const projection = resolveWorkspaceProjectionReadiness(
			await readWorkspaceFileExtraction({ itemId, workspaceId }),
			Date.now(),
		);
		if (projection.state !== "ready") return null;

		const page = await readWorkspacePageProjection({
			itemId,
			pageCount: projection.pageCount,
			pages: "1",
			workspaceId,
		});
		return truncateDescription(page.content);
	} catch {
		// A missing or broken extraction only costs the description, never the read.
		return null;
	}
}

/** One attribute-sized line of a stored image description. */
export function truncateWorkspaceImageDescription(content: string) {
	return truncateDescription(content);
}

function truncateDescription(content: string) {
	const collapsed = content.replace(/\s+/g, " ").trim();
	if (!collapsed) return null;
	return collapsed.length > IMAGE_DESCRIPTION_MAX_CHARACTERS
		? `${collapsed.slice(0, IMAGE_DESCRIPTION_MAX_CHARACTERS - 1)}…`
		: collapsed;
}
