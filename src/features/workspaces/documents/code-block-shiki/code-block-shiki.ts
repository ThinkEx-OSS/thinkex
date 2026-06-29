import { mergeAttributes } from "@tiptap/core";
import CodeBlock, { type CodeBlockOptions } from "@tiptap/extension-code-block";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type { ThemeRegistration } from "shiki/core";

import { CodeBlockNodeView } from "#/features/workspaces/documents/code-block-shiki/CodeBlockNodeView";
import type {
	SupportedCodeLanguage,
	SupportedCodeTheme,
} from "#/features/workspaces/documents/code-block-shiki/highlighter";
import { getCodeLanguageLabel } from "#/features/workspaces/documents/code-block-shiki/highlighter";
import { ShikiPlugin } from "#/features/workspaces/documents/code-block-shiki/shiki-plugin";

export interface CodeBlockShikiOptions extends CodeBlockOptions {
	customThemes: ThemeRegistration[] | null | undefined;
	defaultLanguage: SupportedCodeLanguage | null | undefined;
	themes: {
		dark: SupportedCodeTheme;
		light: SupportedCodeTheme;
	};
}

export const CodeBlockShiki = CodeBlock.extend<CodeBlockShikiOptions>({
	addOptions() {
		return {
			...this.parent?.(),
			customThemes: null,
			defaultLanguage: null,
			themes: {
				dark: "github-dark",
				light: "github-light",
			},
		} as CodeBlockShikiOptions;
	},

	addProseMirrorPlugins() {
		return [
			...(this.parent?.() || []),
			ShikiPlugin({
				customThemes: this.options.customThemes,
				defaultLanguage: this.options.defaultLanguage,
				name: this.name,
				themes: this.options.themes,
			}),
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(CodeBlockNodeView, {
			selectedOnTextSelection: true,
		});
	},

	renderHTML({ node, HTMLAttributes }) {
		const language = typeof node.attrs.language === "string" ? node.attrs.language : "";

		return [
			"pre",
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
				"data-language-label": getCodeLanguageLabel(language),
				"data-workspace-code-block": "",
			}),
			[
				"code",
				{
					class: language ? `${this.options.languageClassPrefix}${language}` : null,
				},
				0,
			],
		];
	},
});
