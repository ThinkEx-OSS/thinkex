import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

import { WorkspaceCitation } from "#/features/workspaces/components/ai-chat/WorkspaceCitation";
import {
	Citation,
	getDocumentCitationLocation,
} from "#/features/workspaces/documents/tiptap-schema";

/**
 * The editor's citation: the same chip a chat reply shows, over the same
 * location. Names are read from the workspace as it stands, so renaming a
 * source renames every citation of it, and a deleted one says so.
 */
export const DocumentCitation = Citation.extend({
	addNodeView() {
		return ReactNodeViewRenderer(DocumentCitationView, { as: "span" });
	},
});

function DocumentCitationView({ node }: { node: { attrs: Record<string, unknown> } }) {
	const location = getDocumentCitationLocation(node.attrs);

	return (
		<NodeViewWrapper as="span" contentEditable={false}>
			{location ? <WorkspaceCitation location={location} /> : null}
		</NodeViewWrapper>
	);
}
