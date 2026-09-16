import type { NodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { Shapes } from "lucide-react";
import { createContext, type ReactNode, use } from "react";

import {
	CodeBlockHeader,
	CodeBlockLabel,
	CodeBlockTitle,
} from "#/components/code-block/code-block-chrome";
import { WorkspaceWidgetSandbox } from "#/features/workspaces/components/widget/WorkspaceWidgetSandbox";
import { detectWidgetLibraries } from "#/features/workspaces/components/widget/workspace-widget-sandbox-document";
import { capturePostHogClientEvent } from "#/integrations/posthog/provider";

const DocumentWidgetActionContext = createContext<((error: string) => void) | null>(null);

export function DocumentWidgetActionProvider({
	children,
	onAskAiToFix,
}: {
	children: ReactNode;
	onAskAiToFix?: (error: string) => void;
}) {
	return (
		<DocumentWidgetActionContext value={onAskAiToFix ?? null}>
			{children}
		</DocumentWidgetActionContext>
	);
}

/**
 * The editor view for authored widget HTML running in its sandboxed frame.
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
export function DocumentWidgetView({ node, selected }: NodeViewProps) {
	const html = node.textContent;
	const title = typeof node.attrs.title === "string" ? node.attrs.title : "";
	const onAskAiToFix = use(DocumentWidgetActionContext);
	const label = title || "Widget";
	const askAiToFix = onAskAiToFix
		? (error: string) => onAskAiToFix(title ? `the "${title}" widget: ${error}` : error)
		: undefined;

	// Which bundled libraries this widget uses, so a graph is countable apart
	// from an ordinary widget and render success and errors have a baseline.
	const libraries = detectWidgetLibraries(html);
	const analyticsProperties = {
		uses_katex: libraries.katex,
		uses_mathjs: libraries.mathjs,
		uses_uplot: libraries.uplot,
		html_length: html.length,
	};

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
			</CodeBlockHeader>
			<WorkspaceWidgetSandbox
				html={html}
				label={title || undefined}
				className="workspace-document-widget-frame"
				onAskAiToFix={askAiToFix}
				onFirstRender={() => capturePostHogClientEvent("widget_rendered", analyticsProperties)}
				onRuntimeError={(preservedFrame) =>
					capturePostHogClientEvent("widget_render_failed", {
						...analyticsProperties,
						preserved_frame: preservedFrame,
					})
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
