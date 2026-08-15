import type { ReactNodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";

import {
	CodeBlockActions,
	CodeBlockCopyButton,
	CodeBlockDownloadButton,
	CodeBlockHeader,
	CodeBlockLanguageSelector,
	CodeBlockLanguageSelectorContent,
	CodeBlockLanguageSelectorItem,
	CodeBlockLanguageSelectorTrigger,
	CodeBlockLanguageSelectorValue,
	CodeBlockTitle,
} from "#/components/code-block/code-block-chrome";
import { MermaidDiagram } from "#/components/code-block/mermaid-diagram";
import {
	codeLanguageOptions,
	getCodeLanguageLabel,
	isMermaidCodeLanguage,
	normalizeCodeLanguage,
	type SupportedCodeLanguage,
} from "#/features/workspaces/documents/code-block-shiki/highlighter";

export function CodeBlockNodeView({
	editor,
	getPos,
	node,
	selected,
	updateAttributes,
}: ReactNodeViewProps) {
	const language = normalizeCodeLanguage(node.attrs.language as string | null);
	const code = node.textContent;
	const codeLanguage = language ?? "text";

	/**
	 * A diagram is only ever the drawing, never the mermaid source that made
	 * it. Nobody hand-writes that syntax — the assistant authors and edits it —
	 * so a click selects the whole block to move or delete, the way an image
	 * behaves. The content stays mounted but hidden because ProseMirror still
	 * needs somewhere to keep the node's text.
	 */
	if (isMermaidCodeLanguage(node.attrs.language as string | null)) {
		return (
			<NodeViewWrapper
				className="workspace-document-diagram"
				contentEditable={false}
				data-selected={selected ? "true" : undefined}
				onClick={() => {
					const position = getPos();
					if (position !== undefined && editor.isEditable) {
						// Focus first: a click on non-editable content leaves the
						// editor blurred, and an unfocused selection ignores Backspace.
						editor.chain().focus().setNodeSelection(position).run();
					}
				}}
			>
				<MermaidDiagram source={code} />
				{/* Same bargain as a widget's source: ProseMirror has to render the
				    node's text somewhere, and the drawing is its visible form. */}
				<NodeViewContent className="workspace-document-diagram-source" />
			</NodeViewWrapper>
		);
	}

	return (
		<NodeViewWrapper
			className="workspace-document-code-block"
			data-language-label={getCodeLanguageLabel(language)}
			data-workspace-code-block=""
		>
			<CodeBlockHeader className="workspace-document-code-block-header" contentEditable={false}>
				<CodeBlockTitle>
					<CodeBlockLanguageSelector
						value={language ?? "plain"}
						onValueChange={(value) => {
							updateAttributes({
								language: value === "plain" ? null : (value as SupportedCodeLanguage),
							});
						}}
					>
						<CodeBlockLanguageSelectorTrigger aria-label="Code language">
							<CodeBlockLanguageSelectorValue>
								{(value: string | null) =>
									value === "plain" ? "Plain text" : getCodeLanguageLabel(value)
								}
							</CodeBlockLanguageSelectorValue>
						</CodeBlockLanguageSelectorTrigger>
						<CodeBlockLanguageSelectorContent className="min-w-44">
							<CodeBlockLanguageSelectorItem value="plain">
								Plain text
							</CodeBlockLanguageSelectorItem>
							{codeLanguageOptions.map((option) => (
								<CodeBlockLanguageSelectorItem key={option.value} value={option.value}>
									{option.label}
								</CodeBlockLanguageSelectorItem>
							))}
						</CodeBlockLanguageSelectorContent>
					</CodeBlockLanguageSelector>
				</CodeBlockTitle>
				<CodeBlockActions>
					<CodeBlockDownloadButton code={code} language={codeLanguage} />
					<CodeBlockCopyButton code={code} />
				</CodeBlockActions>
			</CodeBlockHeader>
			<pre className="workspace-document-code-block-body">
				<NodeViewContent className="workspace-document-code-block-content" spellCheck={false} />
			</pre>
		</NodeViewWrapper>
	);
}
