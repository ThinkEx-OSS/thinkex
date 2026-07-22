import SubscriptExtension from "@tiptap/extension-subscript";
import SuperscriptExtension from "@tiptap/extension-superscript";

export const Subscript = SubscriptExtension.extend({
	excludes: "superscript",
	markdownTokenName: "subscript",
	parseMarkdown: (token, helpers) => {
		const content = helpers.parseInline(token.tokens ?? []);

		return helpers.applyMark("subscript", content);
	},
	renderMarkdown: (node, helpers) => {
		const content = helpers.renderChildren(node.content ?? []);

		return `~${content}~`;
	},
	markdownTokenizer: {
		name: "subscript",
		level: "inline",
		start: (source) => source.indexOf("~"),
		tokenize: (source, _tokens, lexer) => {
			const match = /^~([^~]+)~/.exec(source);

			if (!match) {
				return undefined;
			}

			return {
				type: "subscript",
				raw: match[0],
				text: match[1],
				tokens: lexer.inlineTokens(match[1]),
			};
		},
	},
});

export const Superscript = SuperscriptExtension.extend({
	excludes: "subscript",
	markdownTokenName: "superscript",
	parseMarkdown: (token, helpers) => {
		const content = helpers.parseInline(token.tokens ?? []);

		return helpers.applyMark("superscript", content);
	},
	renderMarkdown: (node, helpers) => {
		const content = helpers.renderChildren(node.content ?? []);

		return `^${content}^`;
	},
	markdownTokenizer: {
		name: "superscript",
		level: "inline",
		start: (source) => source.indexOf("^"),
		tokenize: (source, _tokens, lexer) => {
			const match = /^\^([^^]+)\^/.exec(source);

			if (!match) {
				return undefined;
			}

			return {
				type: "superscript",
				raw: match[0],
				text: match[1],
				tokens: lexer.inlineTokens(match[1]),
			};
		},
	},
});
