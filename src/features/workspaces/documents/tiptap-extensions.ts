import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";
import "katex/dist/katex.min.css";
// Extends the shared KaTeX instance with \ce{} chemistry and \pu{} units.
import "katex/contrib/mhchem";

import { CodeBlockShiki } from "#/features/workspaces/documents/code-block-shiki";
import { DocumentCitation } from "#/features/workspaces/documents/document-citation-node";
import {
	getTiptapDocumentSchemaExtensions,
	tiptapDocumentYjsField,
} from "#/features/workspaces/documents/tiptap-schema";

export { tiptapDocumentYjsField };

export function getTiptapDocumentBaseExtensions() {
	return [
		...getTiptapDocumentSchemaExtensions({
			// Both extend the node spec the server uses, adding only how it draws.
			citation: DocumentCitation,
			codeBlock: CodeBlockShiki,
		}),
		Placeholder.configure({
			placeholder: ({ node }) => (node.type.name === "heading" ? "Untitled" : "Write something..."),
		}),
		CharacterCount,
	];
}
