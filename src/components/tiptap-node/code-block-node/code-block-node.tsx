"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"
import type { NodeViewProps } from "@tiptap/react"
import { NodeViewWrapper, NodeViewContent } from "@tiptap/react"
import { CheckIcon, CopyIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  CodeBlockContainer,
  CodeBlockHeader,
  CodeBlockTitle,
  CodeBlockActions,
  CodeBlockLanguageSelector,
  CodeBlockLanguageSelectorTrigger,
  CodeBlockLanguageSelectorValue,
  CodeBlockLanguageSelectorContent,
  CodeBlockLanguageSelectorItem,
} from "@/components/ai-elements/code-block"
import "@/components/tiptap-node/code-block-node/code-block-node.css"

// Supported languages for the custom Tiptap code block node
const LANGUAGES: Record<string, { name: string; aliases?: string[] }> = {
  text: { name: "Plain Text", aliases: ["plaintext", "txt"] },
  javascript: { name: "JavaScript", aliases: ["js"] },
  typescript: { name: "TypeScript", aliases: ["ts"] },
  jsx: { name: "JSX" },
  tsx: { name: "TSX" },
  html: { name: "HTML" },
  css: { name: "CSS" },
  scss: { name: "SCSS" },
  json: { name: "JSON" },
  python: { name: "Python", aliases: ["py"] },
  java: { name: "Java" },
  c: { name: "C" },
  cpp: { name: "C++", aliases: ["c++"] },
  csharp: { name: "C#", aliases: ["cs", "c#"] },
  go: { name: "Go" },
  rust: { name: "Rust", aliases: ["rs"] },
  ruby: { name: "Ruby", aliases: ["rb"] },
  php: { name: "PHP" },
  swift: { name: "Swift" },
  kotlin: { name: "Kotlin", aliases: ["kt"] },
  sql: { name: "SQL" },
  bash: { name: "Bash", aliases: ["sh", "shell", "zsh"] },
  powershell: { name: "PowerShell", aliases: ["ps", "ps1"] },
  markdown: { name: "Markdown", aliases: ["md"] },
  yaml: { name: "YAML", aliases: ["yml"] },
  xml: { name: "XML" },
  graphql: { name: "GraphQL", aliases: ["gql"] },
  docker: { name: "Docker", aliases: ["dockerfile"] },
  r: { name: "R" },
  scala: { name: "Scala" },
  lua: { name: "Lua" },
  perl: { name: "Perl" },
  latex: { name: "LaTeX", aliases: ["tex"] },
}

// Sort alphabetically for the selector
const sortedLanguages = Object.entries(LANGUAGES).sort(
  ([, a], [, b]) => a.name.localeCompare(b.name)
)

// Resolve alias to canonical language ID
export function resolveLanguageId(lang: string): string {
  if (!lang) return "text"
  const lower = lang.toLowerCase()
  if (LANGUAGES[lower]) return lower
  for (const [id, { aliases }] of Object.entries(LANGUAGES)) {
    if (aliases?.includes(lower)) return id
  }
  return lower
}

// Get display name for a language
function getLanguageName(langId: string): string {
  return LANGUAGES[langId]?.name || langId || "Plain Text"
}

// ─── Copy Button ─────────────────────────────────────────────────────────────

const CopyButton = memo(function CopyButton({ getText }: { getText: () => string }) {
  const [isCopied, setIsCopied] = useState(false)
  const timeoutRef = useRef<number>(0)

  const handleCopy = useCallback(async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) return
    try {
      if (!isCopied) {
        await navigator.clipboard.writeText(getText())
        setIsCopied(true)
        timeoutRef.current = window.setTimeout(() => setIsCopied(false), 2000)
      }
    } catch {
      // Ignore clipboard errors
    }
  }, [getText, isCopied])

  useEffect(() => () => window.clearTimeout(timeoutRef.current), [])

  const Icon = isCopied ? CheckIcon : CopyIcon

  return (
    <Button
      className="shrink-0"
      onClick={handleCopy}
      size="icon"
      variant="ghost"
      type="button"
    >
      <Icon size={14} />
    </Button>
  )
})

// ─── Node View Component ─────────────────────────────────────────────────────

export function CodeBlockNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const rawLanguage = node.attrs.language || "text"
  const language = resolveLanguageId(rawLanguage)
  const isEditable = editor.isEditable
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false)

  const handleLanguageChange = useCallback(
    (lang: string) => {
      updateAttributes({ language: lang })
      setIsLanguageMenuOpen(false)
    },
    [updateAttributes]
  )

  // Get code text from the node for copy
  const getText = useCallback(() => node.textContent || "", [node])

  return (
    <NodeViewWrapper data-language={language}>
      <CodeBlockContainer language={language} className="tiptap-code-block-node">
        {/* Header: language selector + copy button */}
        <CodeBlockHeader contentEditable={false}>
          <CodeBlockTitle>
            {isEditable ? (
              <CodeBlockLanguageSelector
                open={isLanguageMenuOpen}
                onOpenChange={setIsLanguageMenuOpen}
                value={language}
                onValueChange={handleLanguageChange}
              >
                <CodeBlockLanguageSelectorTrigger>
                  <CodeBlockLanguageSelectorValue />
                </CodeBlockLanguageSelectorTrigger>
                {isLanguageMenuOpen ? (
                  <CodeBlockLanguageSelectorContent>
                    {sortedLanguages.map(([id, { name }]) => (
                      <CodeBlockLanguageSelectorItem key={id} value={id}>
                        {name}
                      </CodeBlockLanguageSelectorItem>
                    ))}
                  </CodeBlockLanguageSelectorContent>
                ) : null}
              </CodeBlockLanguageSelector>
            ) : (
              <span className="font-mono text-xs">{getLanguageName(language)}</span>
            )}
          </CodeBlockTitle>
          <CodeBlockActions>
            <CopyButton getText={getText} />
          </CodeBlockActions>
        </CodeBlockHeader>

        {/* Editable code content area — TipTap manages this */}
        <div className="relative overflow-auto">
          <pre className="tiptap-code-block-pre">
            <NodeViewContent className="tiptap-code-block-code" />
          </pre>
        </div>
      </CodeBlockContainer>
    </NodeViewWrapper>
  )
}
