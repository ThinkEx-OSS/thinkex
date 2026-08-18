import { readWorkspacePageProjection } from "#/features/workspaces/extraction/workspace-page-projection";
import { resolveWorkspaceProjectionReadiness } from "#/features/workspaces/extraction/workspace-projection-readiness";
import { readWorkspaceFileExtraction } from "#/features/workspaces/persistence/workspace-files";

const IMAGE_ALT_MAX_CHARACTERS = 300;

// Matches the img tags our own AI HTML serializer emits: attributes are always
// double-quoted and data-item-id is present exactly when the node is a
// workspace image, so a regex is safe here where it would not be on foreign HTML.
const imageTagPattern = /<img\b[^>]*\bdata-item-id="([^"]+)"[^>]*>/g;

/**
 * Rewrites every workspace image tag in AI-facing HTML so its alt text is the
 * image item's stored description (trimmed to one attribute-sized line). The
 * model then knows what each embedded image shows without fetching pixels;
 * view_image is the escalation when the description is not enough. Images
 * whose extraction has not finished keep whatever alt they already had.
 */
export async function annotateWorkspaceImageDescriptions(
	html: string,
	input: { workspaceId: string },
): Promise<string> {
	const itemIds = new Set<string>();
	for (const match of html.matchAll(imageTagPattern)) {
		if (match[1]) itemIds.add(match[1]);
	}
	if (itemIds.size === 0) {
		return html;
	}

	const descriptions = new Map<string, string>();
	await Promise.all(
		Array.from(itemIds, async (itemId) => {
			const description = await readImageDescription(itemId, input.workspaceId);
			if (description) descriptions.set(itemId, description);
		}),
	);
	if (descriptions.size === 0) {
		return html;
	}

	return html.replace(imageTagPattern, (tag, itemId: string) => {
		const description = descriptions.get(itemId);
		if (!description) return tag;
		const withoutAlt = tag.replace(/\salt="[^"]*"/, "");
		return withoutAlt.replace(/^<img\b/, `<img alt="${escapeAttribute(description)}"`);
	});
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
		// A missing or broken extraction only costs the annotation, never the read.
		return null;
	}
}

function truncateDescription(content: string) {
	const collapsed = content.replace(/\s+/g, " ").trim();
	if (!collapsed) return null;
	return collapsed.length > IMAGE_ALT_MAX_CHARACTERS
		? `${collapsed.slice(0, IMAGE_ALT_MAX_CHARACTERS - 1)}…`
		: collapsed;
}

function escapeAttribute(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}
