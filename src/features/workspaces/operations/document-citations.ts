import {
	applyDocumentCitationLocations,
	readDocumentCitationRefs,
} from "#/features/workspaces/documents/document-ai-html";
import {
	parseWorkspaceAddress,
	resolveWorkspaceAddressLocation,
	type WorkspaceLocation,
} from "#/features/workspaces/locations/workspace-location";
import { getWorkspaceItemRefKeyIndex } from "#/features/workspaces/persistence/workspace-items";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";
import { sha256Base64UrlText } from "#/lib/binary";

/**
 * Turn the addresses an assistant cited into the locations a document keeps.
 *
 * The assistant cites the same `refKey/unit` addresses it reads with. They
 * resolve statelessly — refKey to item, unit against the item's type — so the
 * document stores the durable location, and what that source is called is
 * read from the workspace when the citation is drawn.
 *
 * linkedom has crashed mid-traversal on an input nobody has reproduced. A
 * citation is not worth the whole write, so on a failure the HTML goes on
 * unresolved and each citation is kept as a plain label.
 */
export async function resolveDocumentCitations(input: {
	context: WorkspaceAccessContext;
	html: string;
}): Promise<string> {
	try {
		return await resolveDocumentCitationLocations(input);
	} catch (error) {
		recordOperationalFailure({
			distinctId: input.context.actor.userId,
			error,
			event: "document_citation_resolution",
			fields: {
				html_length: input.html.length,
				html_sha256: await sha256Base64UrlText(input.html),
				operation_id: input.context.operationId,
				workspace_id: input.context.workspaceId,
			},
		});
		return input.html;
	}
}

async function resolveDocumentCitationLocations(input: {
	context: WorkspaceAccessContext;
	html: string;
}) {
	const refs = readDocumentCitationRefs(input.html);

	if (refs.length === 0) {
		return input.html;
	}

	const refKeyIndex = await getWorkspaceItemRefKeyIndex({
		workspaceId: input.context.workspaceId,
	});
	const locations = new Map<string, WorkspaceLocation>();
	for (const ref of new Set(refs)) {
		const address = parseWorkspaceAddress(ref);
		if (!address) continue;
		const resolved = refKeyIndex.get(address.refKey);
		const location = resolved ? resolveWorkspaceAddressLocation(resolved.item, address) : undefined;
		if (location) locations.set(ref, location);
	}

	return applyDocumentCitationLocations(input.html, locations);
}
