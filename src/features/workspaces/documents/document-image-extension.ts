import { ReactNodeViewRenderer } from "@tiptap/react";

import { DocumentImageView } from "#/features/workspaces/documents/document-image-node";
import { WorkspaceImage } from "#/features/workspaces/documents/tiptap-schema";

/** Adds the previewing React view to the shared workspace image node. */
export const DocumentImage = WorkspaceImage.extend({
	addNodeView() {
		return ReactNodeViewRenderer(DocumentImageView, {
			ignoreMutation: ({ mutation }) => mutation.type !== "selection",
		});
	},
});
