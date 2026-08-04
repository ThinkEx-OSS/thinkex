import type { NodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

import { WorkspaceWidgetSandbox } from "#/features/workspaces/components/widget/WorkspaceWidgetSandbox";
import { Widget } from "#/features/workspaces/documents/tiptap-schema";

export interface DocumentWidgetOptions {
	/**
	 * Called with a crashed widget's error text so the surface can offer a way
	 * out. Left unset the affordance is hidden, which is right for any read-only
	 * rendering of a document.
	 */
	onAskAiToFix: ((error: string) => void) | null;
}

/**
 * The editor's widget: the authored HTML running in its sandboxed frame.
 *
 * The frame is a separate document, so its own events never reach the editor and
 * there is nothing to suppress. What does reach the editor is a click or drag on
 * the handle, and those have to get through: they are how the widget is selected,
 * deleted and moved. Tiptap's default `stopEvent` already lets exactly those
 * through for a selectable, draggable node, so overriding it only breaks them.
 *
 * `contentEditable={false}` still stops a click being read as a text selection,
 * and `ignoreMutation` stops the editor re-parsing when React re-renders the
 * handle — selection mutations pass through so clicking away behaves normally.
 */
export const DocumentWidget = Widget.extend<DocumentWidgetOptions>({
	addOptions() {
		return { onAskAiToFix: null };
	},

	addNodeView() {
		return ReactNodeViewRenderer(DocumentWidgetView, {
			ignoreMutation: ({ mutation }) => mutation.type !== "selection",
		});
	},
});

function DocumentWidgetView({ extension, node, selected }: NodeViewProps) {
	const html = node.textContent;
	const title = typeof node.attrs.title === "string" ? node.attrs.title : "";
	const { onAskAiToFix } = extension.options as DocumentWidgetOptions;

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
			<WorkspaceWidgetSandbox
				html={html}
				className="workspace-document-widget-frame"
				onAskAiToFix={
					onAskAiToFix
						? (error) => onAskAiToFix(title ? `the "${title}" widget: ${error}` : error)
						: undefined
				}
			/>
			{/* A widget's source is its text content, so ProseMirror needs somewhere
			    to render it. Without this element Tiptap appends one itself and the
			    raw source shows up as prose in the document. It stays hidden: the
			    source is the frame's input, not something to read in the page. */}
			<NodeViewContent className="workspace-document-widget-source" />
		</NodeViewWrapper>
	);
}
