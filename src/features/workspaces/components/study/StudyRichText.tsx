import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";

import { getTiptapDocumentBaseExtensions } from "#/features/workspaces/documents/tiptap-extensions";
import type { TiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";
import { cn } from "#/lib/utils";

/**
 * Read-only rendering of a study item's rich text — a card face, a quiz stem,
 * an answer option. `className` styles the wrapper for layout, `proseClassName`
 * the text itself (measure, size, alignment).
 */
export function StudyRichText({
	className,
	content,
	proseClassName,
}: {
	className?: string;
	content: TiptapDocumentJson;
	proseClassName?: string;
}) {
	const editor = useEditor(
		{
			content: content as unknown as JSONContent,
			editable: false,
			immediatelyRender: false,
			extensions: getTiptapDocumentBaseExtensions(),
			editorProps: {
				attributes: { class: cn("workspace-document-prose outline-none", proseClassName) },
			},
		},
		[content],
	);

	return <EditorContent editor={editor} className={className} />;
}
