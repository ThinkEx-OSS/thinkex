"use client"

import { CodeBlock } from "@tiptap/extension-code-block"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { Plugin } from "@tiptap/pm/state"
import { createHighlightPlugin } from "prosemirror-highlight"
import { createParser } from "prosemirror-highlight/shiki"
import type { HighlighterGeneric } from "@shikijs/types"
import type { Parser } from "prosemirror-highlight"
import { CodeBlockNodeView, resolveLanguageId } from "./code-block-node"

// ─── Shiki Syntax Highlighting Plugin ────────────────────────────────────────

const shikiSymbol = Symbol.for("tiptap.shikiHighlighter")

function createShikiPlugin(): Plugin {
  const globalShiki = globalThis as {
    [shikiSymbol]?: Promise<HighlighterGeneric<any, any>>
  }

  let highlighter: HighlighterGeneric<any, any> | undefined
  let lightParser: Parser | undefined
  let darkParser: Parser | undefined

  const lazyParser: Parser = (parserOptions) => {
    if (!highlighter) {
      if (!globalShiki[shikiSymbol]) {
        globalShiki[shikiSymbol] = import("shiki").then(({ createHighlighter }) =>
          createHighlighter({
            themes: ["github-light", "github-dark"],
            langs: [],
          })
        )
      }

      return globalShiki[shikiSymbol]!.then((h) => {
        highlighter = h
      })
    }

    const language = resolveLanguageId(parserOptions.language ?? "")

    if (
      !language ||
      language === "text" ||
      language === "plaintext" ||
      language === "txt"
    ) {
      return []
    }

    if (!highlighter.getLoadedLanguages().includes(language)) {
      return highlighter.loadLanguage(language as any)
    }

    const prefersDark =
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")

    if (!lightParser) {
      lightParser = createParser(highlighter as any, {
        theme: "github-light",
      } as any)
    }

    if (!darkParser) {
      darkParser = createParser(highlighter as any, {
        theme: "github-dark",
      } as any)
    }

    return (prefersDark ? darkParser : lightParser)(parserOptions)
  }

  return createHighlightPlugin({
    parser: lazyParser,
    languageExtractor: (node: any) => node.attrs.language,
    nodeTypes: ["codeBlock"],
  })
}

// ─── Custom CodeBlock Extension ──────────────────────────────────────────────

export const CustomCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView)
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      createShikiPlugin(),
    ]
  },
})
