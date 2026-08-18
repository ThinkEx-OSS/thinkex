import CharacterCount from "@tiptap/extension-character-count";
import { FindAndReplace } from "@tiptap/extension-find-and-replace";
import Placeholder from "@tiptap/extension-placeholder";
import "katex/dist/katex.min.css";
// Extends the shared KaTeX instance with \ce{} chemistry and \pu{} units.
import "katex/contrib/mhchem";

import { WorkspaceCitationNode } from "#/features/workspaces/components/WorkspaceCitationNode";
import { CodeBlockShiki } from "#/features/workspaces/documents/code-block-shiki";
import {
	getTiptapDocumentSchemaExtensions,
	tiptapDocumentYjsField,
} from "#/features/workspaces/documents/tiptap-schema";
import { DocumentImage } from "#/features/workspaces/documents/document-image-extension";
import { DocumentWidget } from "#/features/workspaces/documents/document-widget-extension";

export { tiptapDocumentYjsField };

export function getTiptapDocumentBaseExtensions() {
	return [
		...getTiptapDocumentSchemaExtensions({
			// All four extend the node spec the server uses, adding only how it draws.
			citation: WorkspaceCitationNode,
			codeBlock: CodeBlockShiki,
			image: DocumentImage,
			widget: DocumentWidget,
		}),
		Placeholder.configure({
			placeholder: ({ node }) => (node.type.name === "heading" ? "Untitled" : "Write something..."),
		}),
		CharacterCount,
		// Editor-only, so it stays out of the shared schema the server renders
		// with. Highlight styles live in styles.css beside the other surfaces'.
		FindAndReplace.configure({ injectCSS: false }),
	];
}
