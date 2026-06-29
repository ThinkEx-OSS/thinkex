import { findChildren } from "@tiptap/core";
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey, type PluginView } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { SpecialLanguage, ThemeRegistration } from "shiki/core";

import {
	getShiki,
	initHighlighter,
	normalizeCodeLanguage,
	type SupportedCodeLanguage,
	type SupportedCodeTheme,
} from "#/features/workspaces/documents/code-block-shiki/highlighter";

type ThemePair = {
	dark: SupportedCodeTheme;
	light: SupportedCodeTheme;
};
type HighlightLanguage = SupportedCodeLanguage | SpecialLanguage;

function styleToHtml(styles: Record<string, string>) {
	return Object.entries(styles)
		.map(([key, value]) => `${key}:${value}`)
		.join(";");
}

function getDecorations({
	defaultLanguage,
	doc,
	name,
	themes,
}: {
	defaultLanguage: SupportedCodeLanguage | null | undefined;
	doc: ProsemirrorNode;
	name: string;
	themes: ThemePair;
}) {
	const decorations: Decoration[] = [];
	const codeBlocks = findChildren(doc, (node) => node.type.name === name);
	const highlighter = getShiki();

	if (!highlighter) {
		return DecorationSet.create(doc, decorations);
	}

	for (const block of codeBlocks) {
		let from = block.pos + 1;
		const language = getLoadedLanguage({
			defaultLanguage,
			highlighter,
			language: block.node.attrs.language as string | null | undefined,
		});
		const tokens = getMultiThemeTokens({
			code: block.node.textContent,
			highlighter,
			language,
			themes,
		});

		decorations.push(
			Decoration.node(block.pos, block.pos + block.node.nodeSize, {
				class: "shiki",
			}),
		);

		for (const line of tokens.tokens) {
			for (const token of line) {
				const to = from + token.content.length;
				const htmlStyle = token.htmlStyle ?? {
					color: token.color || "inherit",
				};

				decorations.push(
					Decoration.inline(from, to, {
						style: styleToHtml(htmlStyle),
					}),
				);

				from = to;
			}

			from += 1;
		}
	}

	return DecorationSet.create(doc, decorations);
}

function getLoadedLanguage({
	defaultLanguage,
	highlighter,
	language,
}: {
	defaultLanguage: SupportedCodeLanguage | null | undefined;
	highlighter: NonNullable<ReturnType<typeof getShiki>>;
	language: string | null | undefined;
}): HighlightLanguage {
	const normalizedLanguage = normalizeCodeLanguage(language) ?? defaultLanguage;

	if (normalizedLanguage && highlighter.getLoadedLanguages().includes(normalizedLanguage)) {
		return normalizedLanguage;
	}

	return "plaintext";
}

function getMultiThemeTokens({
	code,
	highlighter,
	language,
	themes,
}: {
	code: string;
	highlighter: NonNullable<ReturnType<typeof getShiki>>;
	language: HighlightLanguage;
	themes: ThemePair;
}) {
	return highlighter.codeToTokens(code, {
		lang: language,
		themes: {
			dark: getThemeToApply(highlighter, themes.dark),
			light: getThemeToApply(highlighter, themes.light),
		},
	});
}

function getThemeToApply(
	highlighter: NonNullable<ReturnType<typeof getShiki>>,
	theme: SupportedCodeTheme,
) {
	if (theme && highlighter.getLoadedThemes().includes(theme)) {
		return theme;
	}

	return highlighter.getLoadedThemes()[0] as SupportedCodeTheme;
}

function didCodeBlocksChange({
	name,
	newDoc,
	oldDoc,
}: {
	name: string;
	newDoc: ProsemirrorNode;
	oldDoc: ProsemirrorNode;
}) {
	const oldNodes = findChildren(oldDoc, (node) => node.type.name === name);
	const newNodes = findChildren(newDoc, (node) => node.type.name === name);

	if (oldNodes.length !== newNodes.length) {
		return true;
	}

	return newNodes.some((node, index) => {
		const oldNode = oldNodes[index];
		return !oldNode || !node.node.eq(oldNode.node) || node.pos !== oldNode.pos;
	});
}

function getCodeBlockLoadKey({
	defaultLanguage,
	doc,
	name,
	themes,
}: {
	defaultLanguage: SupportedCodeLanguage | null | undefined;
	doc: ProsemirrorNode;
	name: string;
	themes: ThemePair;
}) {
	const languages = new Set<string>();

	if (defaultLanguage) {
		languages.add(defaultLanguage);
	}

	for (const block of findChildren(doc, (node) => node.type.name === name)) {
		const language = normalizeCodeLanguage(block.node.attrs.language as string);

		if (language) {
			languages.add(language);
		}
	}

	return `${themes.light}:${themes.dark}:${[...languages].sort().join(",")}`;
}

export function ShikiPlugin({
	customThemes,
	defaultLanguage,
	name,
	themes,
}: {
	customThemes: ThemeRegistration[] | null | undefined;
	defaultLanguage: SupportedCodeLanguage | null | undefined;
	name: string;
	themes: ThemePair;
}) {
	const shikiPlugin: Plugin<DecorationSet> = new Plugin({
		key: new PluginKey("workspaceDocumentCodeBlockShiki"),

		props: {
			decorations(state) {
				return shikiPlugin.getState(state);
			},
		},

		state: {
			apply: (transaction, decorationSet, oldState, newState) => {
				const oldNodeName = oldState.selection.$head.parent.type.name;
				const newNodeName = newState.selection.$head.parent.type.name;
				const didChangeAroundCodeBlock =
					transaction.docChanged &&
					([oldNodeName, newNodeName].includes(name) ||
						didCodeBlocksChange({
							name,
							newDoc: newState.doc,
							oldDoc: oldState.doc,
						}));

				if (transaction.getMeta("workspaceDocumentCodeBlockShiki") || didChangeAroundCodeBlock) {
					return getDecorations({
						defaultLanguage,
						doc: transaction.doc,
						name,
						themes,
					});
				}

				return decorationSet.map(transaction.mapping, transaction.doc);
			},
			init: (_, { doc }) =>
				getDecorations({
					defaultLanguage,
					doc,
					name,
					themes,
				}),
		},

		view(view) {
			class ShikiPluginView implements PluginView {
				private activeLoadKey: string | null = null;
				private destroyed = false;
				private loadedKey: string | null = null;
				private queuedDoc: ProsemirrorNode | null = null;

				constructor() {
					this.scheduleDecorationLoad(view.state.doc);
				}

				destroy() {
					this.destroyed = true;
				}

				update(_view: typeof view, previousState: EditorState) {
					if (
						previousState.doc === view.state.doc ||
						!didCodeBlocksChange({
							name,
							newDoc: view.state.doc,
							oldDoc: previousState.doc,
						})
					) {
						return;
					}

					this.scheduleDecorationLoad(view.state.doc);
				}

				private scheduleDecorationLoad(doc: ProsemirrorNode) {
					const loadKey = getCodeBlockLoadKey({
						defaultLanguage,
						doc,
						name,
						themes,
					});

					if (this.loadedKey === loadKey) {
						return;
					}

					if (this.activeLoadKey) {
						this.queuedDoc = doc;
						return;
					}

					void this.loadDecorations(doc, loadKey);
				}

				private async loadDecorations(doc: ProsemirrorNode, loadKey: string) {
					this.activeLoadKey = loadKey;

					try {
						if (this.destroyed || view.isDestroyed) {
							return;
						}

						const didLoad = await initHighlighter({
							customThemes: customThemes ?? undefined,
							defaultLanguage,
							doc,
							name,
							themes,
						});

						if (this.destroyed || view.isDestroyed) {
							return;
						}

						this.loadedKey = loadKey;

						if (didLoad) {
							view.dispatch(view.state.tr.setMeta("workspaceDocumentCodeBlockShiki", true));
						}
					} finally {
						this.activeLoadKey = null;

						if (!this.destroyed && this.queuedDoc) {
							const queuedDoc = this.queuedDoc;
							this.queuedDoc = null;
							this.scheduleDecorationLoad(queuedDoc);
						}
					}
				}
			}

			return new ShikiPluginView();
		},
	});

	return shikiPlugin;
}
