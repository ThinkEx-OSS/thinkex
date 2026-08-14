import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

import { WorkspaceCitation } from "#/features/workspaces/components/WorkspaceCitation";
import {
	Citation,
	getWorkspaceCitationLocation,
} from "#/features/workspaces/documents/tiptap-schema";

/** Draws a persisted Tiptap citation through the shared workspace citation UI. */
export const WorkspaceCitationNode = Citation.extend({
	addNodeView() {
		return ReactNodeViewRenderer(WorkspaceCitationNodeView, { as: "span" });
	},
});

function WorkspaceCitationNodeView({ node }: { node: { attrs: Record<string, unknown> } }) {
	const location = getWorkspaceCitationLocation(node.attrs);

	return (
		<NodeViewWrapper as="span" contentEditable={false}>
			{location ? <WorkspaceCitation location={location} /> : null}
		</NodeViewWrapper>
	);
}
