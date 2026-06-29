import { type AnyExtension, getSchema } from "@tiptap/core";
import CodeBlock from "@tiptap/extension-code-block";
import Highlight from "@tiptap/extension-highlight";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Link from "@tiptap/extension-link";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Mathematics } from "@tiptap/extension-mathematics";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import UnderlineExtension from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";

export const tiptapDocumentYjsField = "default";

/**
 * Server-side code block extension. The editor swaps in `CodeBlockShiki`,
 * which extends the same `codeBlock` node spec, so JSON snapshots stay
 * compatible between kernel preview/session code and the live editor.
 */
export const tiptapDocumentKernelCodeBlock = CodeBlock;

export function getTiptapDocumentSchemaExtensions({
	codeBlock = tiptapDocumentKernelCodeBlock,
}: {
	codeBlock?: AnyExtension;
} = {}) {
	return [
		StarterKit.configure({
			heading: {
				levels: [1, 2, 3],
			},
			codeBlock: false,
			horizontalRule: false,
			link: false,
			underline: false,
			undoRedo: false,
		}),
		codeBlock,
		HorizontalRule,
		UnderlineExtension,
		Highlight,
		Link.configure({
			openOnClick: false,
			autolink: true,
			defaultProtocol: "https",
		}),
		Mathematics.configure({
			katexOptions: {
				throwOnError: false,
			},
		}),
		TextAlign.configure({
			types: ["heading", "paragraph"],
		}),
		TaskList,
		TaskItem.configure({
			nested: true,
		}),
		TableKit.configure({
			table: {
				lastColumnResizable: false,
				resizable: true,
			},
		}),
	];
}

const tiptapDocumentSchema = getSchema(getTiptapDocumentSchemaExtensions());

export function getTiptapDocumentSchema() {
	return tiptapDocumentSchema;
}
