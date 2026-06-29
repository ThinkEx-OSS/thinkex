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
import {
	codeLanguageOptions,
	getCodeLanguageLabel,
	normalizeCodeLanguage,
	type SupportedCodeLanguage,
} from "#/features/workspaces/documents/code-block-shiki/highlighter";

export function CodeBlockNodeView({ node, updateAttributes }: ReactNodeViewProps) {
	const language = normalizeCodeLanguage(node.attrs.language as string | null);
	const code = node.textContent;
	const codeLanguage = language ?? "text";

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
