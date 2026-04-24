"use client"

import { memo, useCallback, useState } from "react"
import type { NodeViewProps } from "@tiptap/react"
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react"
import {
  CodeBlockContainer,
  CodeBlockCopyButton,
  CodeBlockHeader,
} from "streamdown"
import { bundledLanguagesInfo } from "shiki"
import "streamdown/styles.css"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import "@/components/tiptap-node/code-block-node/code-block-node.css"

const PLAIN_TEXT_LANGUAGE = {
  id: "text",
  name: "Plain Text",
}

const languageAliasMap = new Map<string, string>([
  ["text", "text"],
  ["plain", "text"],
  ["plaintext", "text"],
  ["txt", "text"],
])

const languageNameMap = new Map<string, string>([
  [PLAIN_TEXT_LANGUAGE.id, PLAIN_TEXT_LANGUAGE.name],
])

const sortedLanguages = [
  PLAIN_TEXT_LANGUAGE,
  ...bundledLanguagesInfo
    .map((language) => {
      const label =
        language.name ??
        language.aliases?.[0] ??
        language.id

      languageNameMap.set(language.id, label)
      languageAliasMap.set(language.id, language.id)
      for (const alias of language.aliases ?? []) {
        languageAliasMap.set(alias.toLowerCase(), language.id)
      }

      return {
        id: language.id,
        name: label,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name)),
]

export function resolveLanguageId(lang: string): string {
  if (!lang) return "text"
  return languageAliasMap.get(lang.toLowerCase()) ?? lang.toLowerCase()
}

function getLanguageName(langId: string): string {
  return languageNameMap.get(langId) ?? langId ?? "Plain Text"
}

const EditableCodeBlockHeader = memo(function EditableCodeBlockHeader({
  language,
  isLanguageMenuOpen,
  onLanguageChange,
  onOpenChange,
}: {
  language: string
  isLanguageMenuOpen: boolean
  onLanguageChange: (language: string) => void
  onOpenChange: (open: boolean) => void
}) {
  return (
    <div
      className="flex min-h-8 items-center justify-between gap-2 text-muted-foreground text-xs"
      contentEditable={false}
      data-language={language}
      data-streamdown="code-block-header"
    >
      <Select
        open={isLanguageMenuOpen}
        onOpenChange={onOpenChange}
        value={language}
        onValueChange={onLanguageChange}
      >
        <SelectTrigger
          className="h-7 w-auto min-w-0 border-none bg-transparent px-2 text-xs font-mono lowercase shadow-none"
          size="sm"
        >
          <SelectValue>{getLanguageName(language)}</SelectValue>
        </SelectTrigger>
        {isLanguageMenuOpen ? (
          <SelectContent align="start">
            {sortedLanguages.map(({ id, name }) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        ) : null}
      </Select>

    </div>
  )
})

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

  const code = node.textContent || ""

  return (
    <NodeViewWrapper data-language={language}>
      <CodeBlockContainer language={language} className="tiptap-code-block-node">
        {isEditable ? (
          <EditableCodeBlockHeader
            isLanguageMenuOpen={isLanguageMenuOpen}
            language={language}
            onLanguageChange={handleLanguageChange}
            onOpenChange={setIsLanguageMenuOpen}
          />
        ) : (
          <CodeBlockHeader language={getLanguageName(language)} />
        )}

        <div
          className="pointer-events-none sticky top-2 z-10 -mt-10 flex h-8 items-center justify-end"
          contentEditable={false}
          data-streamdown="code-block-actions"
        >
          <div className="pointer-events-auto flex shrink-0 items-center gap-2 rounded-md border border-sidebar bg-sidebar/80 px-1.5 py-1 supports-[backdrop-filter]:bg-sidebar/70 supports-[backdrop-filter]:backdrop-blur">
            <CodeBlockCopyButton code={code} type="button" />
          </div>
        </div>

        <div
          className={cn(
            "overflow-x-auto rounded-md border border-border bg-background p-4 text-sm",
            "tiptap-code-block-body"
          )}
          data-language={language}
          data-streamdown="code-block-body"
        >
          <NodeViewContent as="div" className="tiptap-code-block-content" />
        </div>
      </CodeBlockContainer>
    </NodeViewWrapper>
  )
}
