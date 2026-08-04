import { ReactNodeViewRenderer } from "@tiptap/react";

import { DocumentWidgetView } from "#/features/workspaces/documents/document-widget-node";
import { Widget } from "#/features/workspaces/documents/tiptap-schema";

/** Adds the sandboxed React view to the shared widget schema node. */
export const DocumentWidget = Widget.extend({
	addNodeView() {
		return ReactNodeViewRenderer(DocumentWidgetView, {
			ignoreMutation: ({ mutation }) => mutation.type !== "selection",
		});
	},
});
