import { Extension } from "@tiptap/core";

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

  parseMarkdown: (token: any) => ({
    type: "text",
    text: token.text ?? "",
  }),
});
