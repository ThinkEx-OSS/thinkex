import {
	applyDocumentCitationLocations,
	readDocumentCitationRefs,
} from "#/features/workspaces/documents/document-ai-html";
import { indexWorkspaceReferenceRecords } from "#/features/workspaces/locations/workspace-location";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";

/**
 * Turn the refs an assistant cited into the locations a document can keep.
 *
 * The assistant cites `wr_` refs, the same way it cites in a chat reply, but a
 * ref only means something inside the turn that produced it. Resolving here
 * lets the document store the item and page it points at; what that source is
 * called is read from the workspace when the citation is drawn.
 */
export async function resolveDocumentCitations(input: {
	context: WorkspaceAccessContext;
	html: string;
}): Promise<string> {
	const refs = readDocumentCitationRefs(input.html);

	if (refs.length === 0 || !input.context.resolveWorkspaceReferences) {
		return input.html;
	}

	const records = await input.context.resolveWorkspaceReferences(refs);
	const locations = new Map(
		[...indexWorkspaceReferenceRecords(records)].flatMap(([ref, record]) =>
			record ? [[ref, record.location] as const] : [],
		),
	);

	return applyDocumentCitationLocations(input.html, locations);
}
