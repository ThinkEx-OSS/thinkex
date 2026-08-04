import type { NodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Maximize2, Minimize2, Shapes } from "lucide-react";
import { useState } from "react";

import {
	CodeBlockActions,
	CodeBlockHeader,
	CodeBlockLabel,
	CodeBlockTitle,
} from "#/components/code-block/code-block-chrome";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "#/components/ui/dialog";
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
 * the header, and those have to get through: they are how the widget is selected,
 * deleted and moved. Tiptap's default `stopEvent` already lets exactly those
 * through for a selectable, draggable node, so overriding it only breaks them.
 *
 * `contentEditable={false}` still stops a click being read as a text selection,
 * and `ignoreMutation` stops the editor re-parsing when React re-renders the
 * header — selection mutations pass through so clicking away behaves normally.
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
	const [isFullscreen, setIsFullscreen] = useState(false);
	const label = title || "Widget";
	const askAiToFix = onAskAiToFix
		? (error: string) => onAskAiToFix(title ? `the "${title}" widget: ${error}` : error)
		: undefined;

	return (
		<NodeViewWrapper
			className="workspace-document-widget"
			contentEditable={false}
			data-selected={selected ? "true" : undefined}
		>
			{/* Shared block chrome, as the code block and Mermaid diagram use, so
			    every embedded block in a document reads as the same kind of thing.
			    It doubles as the drag handle: without it there is no way to pick the
			    widget up or delete it, since clicks inside go to the frame. */}
			<CodeBlockHeader
				className="workspace-document-widget-header min-h-10"
				data-drag-handle
				contentEditable={false}
			>
				<CodeBlockTitle>
					<Shapes className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					<CodeBlockLabel>{label}</CodeBlockLabel>
				</CodeBlockTitle>
				<CodeBlockActions>
					<WidgetControl label="View fullscreen" onClick={() => setIsFullscreen(true)}>
						<Maximize2 />
					</WidgetControl>
				</CodeBlockActions>
			</CodeBlockHeader>
			{/* Hidden while fullscreen: two live frames would run the widget twice,
			    and the one behind the dialog would keep its own separate state. */}
			{isFullscreen ? null : (
				<WorkspaceWidgetSandbox
					html={html}
					className="workspace-document-widget-frame"
					onAskAiToFix={askAiToFix}
				/>
			)}
			{/* A widget's source is its text content, so ProseMirror needs somewhere
			    to render it. Without this element Tiptap appends one itself and the
			    raw source shows up as prose in the document. It stays hidden: the
			    source is the frame's input, not something to read in the page. */}
			<NodeViewContent className="workspace-document-widget-source" />

			<Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
				<DialogContent
					className="fixed inset-0 top-0 left-0 flex h-dvh w-dvw max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-background p-0 sm:max-w-none"
					showCloseButton={false}
				>
					<CodeBlockHeader className="min-h-12 shrink-0 px-4">
						<CodeBlockTitle>
							<Shapes className="size-4 text-muted-foreground" aria-hidden="true" />
							<DialogTitle className="text-sm">{label}</DialogTitle>
						</CodeBlockTitle>
						<CodeBlockActions>
							<WidgetControl label="Exit fullscreen" onClick={() => setIsFullscreen(false)}>
								<Minimize2 />
							</WidgetControl>
						</CodeBlockActions>
					</CodeBlockHeader>
					{isFullscreen ? (
						<WorkspaceWidgetSandbox
							html={html}
							className="min-h-0 flex-1"
							fill
							onAskAiToFix={askAiToFix}
						/>
					) : null}
				</DialogContent>
			</Dialog>
		</NodeViewWrapper>
	);
}

function WidgetControl({
	children,
	label,
	onClick,
}: {
	children: React.ReactNode;
	label: string;
	onClick: () => void;
}) {
	return (
		<Button
			aria-label={label}
			className="size-7 text-muted-foreground [&_svg]:size-3.5"
			onClick={onClick}
			size="icon"
			title={label}
			type="button"
			variant="ghost"
		>
			{children}
		</Button>
	);
}
