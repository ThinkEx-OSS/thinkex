import {
	applyDocumentCitationLocations,
	readDocumentCitationRefs,
} from "#/features/workspaces/documents/document-ai-html";
import {
	parseWorkspaceAddress,
	resolveWorkspaceAddressLocation,
	type WorkspaceLocation,
} from "#/features/workspaces/locations/workspace-location";
import { getWorkspaceItemByRefKey } from "#/features/workspaces/persistence/workspace-items";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";

/**
 * Turn the addresses an assistant cited into the locations a document keeps.
 *
 * The assistant cites the same `refKey/unit` addresses it reads with. They
 * resolve statelessly — refKey to item, unit against the item's type — so the
 * document stores the durable location, and what that source is called is
 * read from the workspace when the citation is drawn.
 */
export async function resolveDocumentCitations(input: {
	context: WorkspaceAccessContext;
	html: string;
}): Promise<string> {
	const refs = readDocumentCitationRefs(input.html);

	if (refs.length === 0) {
		return input.html;
	}

	const locations = new Map<string, WorkspaceLocation>();
	for (const ref of new Set(refs)) {
		const address = parseWorkspaceAddress(ref);
		if (!address) continue;
		const resolved = await getWorkspaceItemByRefKey({
			refKey: address.refKey,
			workspaceId: input.context.workspaceId,
		});
		const location = resolved ? resolveWorkspaceAddressLocation(resolved.item, address) : undefined;
		if (location) locations.set(ref, location);
	}

	return applyDocumentCitationLocations(input.html, locations);
}
