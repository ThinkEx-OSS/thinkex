import { Extension, type MarkdownToken } from "@tiptap/core";

type EscapeMarkdownToken = MarkdownToken & {
  type: "escape";
  raw: string;
  text: string;
};

function isEscapeMarkdownToken(token: MarkdownToken): token is EscapeMarkdownToken {
  return token.type === "escape" && typeof token.text === "string";
}

/**
 * TipTap's MarkdownManager silently drops marked.js 'escape' tokens
 * (e.g. \$ → $, \* → *, \[ → [). This extension registers a handler
 * that converts them to text nodes so backslash-escaped characters
 * are preserved in the rendered document.
 *
 * Without this, AI-generated content containing \$5 (escaped currency)
 * loses the $ character entirely.
 */
export const MarkdownEscape = Extension.create({
  name: "markdownEscapeHandler",

  markdownTokenName: "escape",

  parseMarkdown: (token: MarkdownToken) => {
    if (!isEscapeMarkdownToken(token)) {
      return {
        type: "text",
        text: token.raw ?? "",
      };
    }

    return {
      type: "text",
      text: token.text,
    };
  },
});
