import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";
import "katex/dist/katex.min.css";
// Extends the shared KaTeX instance with \ce{} chemistry and \pu{} units.
import "katex/contrib/mhchem";

import { CodeBlockShiki } from "#/features/workspaces/documents/code-block-shiki";
import { DocumentWidget } from "#/features/workspaces/documents/document-widget-extension";
import { DocumentCitation } from "#/features/workspaces/documents/document-citation-node";
import {
	getTiptapDocumentSchemaExtensions,
	tiptapDocumentYjsField,
} from "#/features/workspaces/documents/tiptap-schema";

export { tiptapDocumentYjsField };

export function getTiptapDocumentBaseExtensions(
	options: { onAskAiToFixWidget?: (error: string) => void } = {},
) {
	return [
		...getTiptapDocumentSchemaExtensions({
			// All three extend the node spec the server uses, adding only how it draws.
			citation: DocumentCitation,
			codeBlock: CodeBlockShiki,
			widget: DocumentWidget.configure({
				onAskAiToFix: options.onAskAiToFixWidget ?? null,
			}),
		}),
		Placeholder.configure({
			placeholder: ({ node }) => (node.type.name === "heading" ? "Untitled" : "Write something..."),
		}),
		CharacterCount,
	];
}
