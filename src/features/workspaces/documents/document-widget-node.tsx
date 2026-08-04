import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

import { WorkspaceWidgetSandbox } from "#/features/workspaces/components/widget/WorkspaceWidgetSandbox";
import { Widget } from "#/features/workspaces/documents/tiptap-schema";

/**
 * The editor's widget: the authored HTML running in its sandboxed frame.
 *
 * Three things keep ProseMirror and the frame out of each other's way.
 * `contentEditable={false}` stops a click inside the widget being read as a text
 * selection. `stopEvent` keeps events raised inside the node view from reaching
 * the editor at all. `ignoreMutation` stops the editor re-parsing when the frame
 * changes its own DOM — selection mutations still pass through, so clicking away
 * from the widget behaves normally.
 */
export const DocumentWidget = Widget.extend({
	addNodeView() {
		return ReactNodeViewRenderer(DocumentWidgetView, {
			stopEvent: () => true,
			ignoreMutation: ({ mutation }) => mutation.type !== "selection",
		});
	},
});

function DocumentWidgetView({ node, selected }: NodeViewProps) {
	const html = node.textContent;
	const title = typeof node.attrs.title === "string" ? node.attrs.title : "";

	return (
		<NodeViewWrapper
			className="workspace-document-widget"
			contentEditable={false}
			data-selected={selected ? "true" : undefined}
		>
			{/* The only editor-owned affordance: without it there is no way to pick
			    the widget up or delete it, since clicks go to the frame. */}
			<div className="workspace-document-widget-handle" data-drag-handle contentEditable={false}>
				<span>{title || "Widget"}</span>
			</div>
			<WorkspaceWidgetSandbox html={html} className="workspace-document-widget-frame" />
		</NodeViewWrapper>
	);
}
