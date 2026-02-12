"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { createBlockConfig, createExtension } from "@blocknote/core";
import type { CodeBlockOptions } from "@blocknote/core";
import { codeBlockOptions } from "@blocknote/code-block";
import { memo, useState, useCallback, useRef, useEffect } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createHighlightPlugin } from "prosemirror-highlight";
import { createParser } from "prosemirror-highlight/shiki";
import type { HighlighterGeneric } from "@shikijs/types";
import type { Parser } from "prosemirror-highlight";
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
} from "@/components/ai-elements/code-block";
import "./code-block-custom.css";

// Supported languages from the code-block package options
const supportedLanguages = codeBlockOptions.supportedLanguages;

// Helper: get language display name
function getLanguageName(langId: string): string {
    const lang = supportedLanguages[langId as keyof typeof supportedLanguages];
    return lang?.name || langId || "Plain Text";
}

// Helper: get language ID from name or alias
function getLanguageId(languageName: string): string | undefined {
    return Object.entries(supportedLanguages).find(
        ([id, { aliases }]) => {
            return aliases?.includes(languageName) || id === languageName;
        },
    )?.[0];
}

// Helper: extract text from BlockNote inline content
function extractText(content: any[]): string {
    if (!content || !Array.isArray(content)) return "";
    return content
        .map((item: any) => {
            if (item.type === "text") return item.text || "";
            if (item.type === "link" && item.content) {
                return item.content.map((sub: any) => sub.text || "").join("");
            }
            return "";
        })
        .join("");
}

// Sort languages alphabetically for the selector
const sortedLanguages = Object.entries(supportedLanguages).sort(
    ([, a], [, b]) => a.name.localeCompare(b.name)
);

// ─── Shiki ProseMirror Plugin (recreated from @blocknote/core internals) ────

const shikiParserSymbol = Symbol.for("blocknote.shikiParser");
const shikiHighlighterPromiseSymbol = Symbol.for("blocknote.shikiHighlighterPromise");

function createShikiHighlightPlugin(options: CodeBlockOptions) {
    const globalThisForShiki = globalThis as {
        [shikiHighlighterPromiseSymbol]?: Promise<HighlighterGeneric<any, any>>;
        [shikiParserSymbol]?: Parser;
    };

    let highlighter: HighlighterGeneric<any, any> | undefined;
    let parser: Parser | undefined;
    let hasWarned = false;

    const lazyParser: Parser = (parserOptions) => {
        if (!options.createHighlighter) {
            if (process.env.NODE_ENV === "development" && !hasWarned) {
                console.log(
                    "For syntax highlighting of code blocks, provide createHighlighter option",
                );
                hasWarned = true;
            }
            return [];
        }
        if (!highlighter) {
            globalThisForShiki[shikiHighlighterPromiseSymbol] =
                globalThisForShiki[shikiHighlighterPromiseSymbol] ||
                options.createHighlighter();

            return globalThisForShiki[shikiHighlighterPromiseSymbol]!.then(
                (createdHighlighter) => {
                    highlighter = createdHighlighter;
                },
            );
        }

        const language = getLanguageId(parserOptions.language!) ?? parserOptions.language;

        if (
            !language ||
            language === "text" ||
            language === "none" ||
            language === "plaintext" ||
            language === "txt"
        ) {
            return [];
        }

        if (!highlighter.getLoadedLanguages().includes(language)) {
            return highlighter.loadLanguage(language as any);
        }

        if (!parser) {
            // Use one-dark-pro theme to match BlockNotePreview
            parser = createParser(highlighter as any, { theme: "one-dark-pro" } as any);
        }

        return parser(parserOptions);
    };

    return createHighlightPlugin({
        parser: lazyParser,
        languageExtractor: (node: any) => node.attrs.language,
        nodeTypes: ["codeBlock"],
    });
}

// ─── Copy Button (standalone, takes text directly) ──────────────────────────

const EditorCopyButton = memo(function EditorCopyButton({ text }: { text: string }) {
    const [isCopied, setIsCopied] = useState(false);
    const timeoutRef = useRef<number>(0);

    const handleCopy = useCallback(async () => {
        if (typeof window === "undefined" || !navigator?.clipboard?.writeText) return;
        try {
            if (!isCopied) {
                await navigator.clipboard.writeText(text);
                setIsCopied(true);
                timeoutRef.current = window.setTimeout(() => setIsCopied(false), 2000);
            }
        } catch {
            // Ignore clipboard errors
        }
    }, [text, isCopied]);

    useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

    const Icon = isCopied ? CheckIcon : CopyIcon;

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
    );
});

// ─── Main Code Block Render ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CodeBlockRender = memo(function CodeBlockRender(props: any) {
    const { block, editor, contentRef } = props;
    const rawLanguage = block.props.language || "text";
    // Resolve aliases (e.g. "bash" → "shellscript") to the primary ID used by SelectItems
    const language = getLanguageId(rawLanguage) ?? rawLanguage;
    const isEditable = editor.isEditable;

    const handleLanguageChange = useCallback(
        (lang: string) => {
            editor.updateBlock(block, { props: { language: lang } });
        },
        [editor, block]
    );

    // Extract code text for copy button
    const codeText = extractText(block.content);

    return (
        <CodeBlockContainer language={language} className="custom-code-block-editor">
            {/* Header: language selector + copy button */}
            <CodeBlockHeader>
                <CodeBlockTitle>
                    {isEditable ? (
                        <CodeBlockLanguageSelector
                            value={language}
                            onValueChange={handleLanguageChange}
                        >
                            <CodeBlockLanguageSelectorTrigger>
                                <CodeBlockLanguageSelectorValue />
                            </CodeBlockLanguageSelectorTrigger>
                            <CodeBlockLanguageSelectorContent>
                                {sortedLanguages.map(([id, { name }]) => (
                                    <CodeBlockLanguageSelectorItem key={id} value={id}>
                                        {name}
                                    </CodeBlockLanguageSelectorItem>
                                ))}
                            </CodeBlockLanguageSelectorContent>
                        </CodeBlockLanguageSelector>
                    ) : (
                        <span className="font-mono text-xs">{getLanguageName(language)}</span>
                    )}
                </CodeBlockTitle>
                <CodeBlockActions>
                    <EditorCopyButton text={codeText} />
                </CodeBlockActions>
            </CodeBlockHeader>

            {/* Editable code content area */}
            <div className="relative overflow-auto">
                <pre className="code-block-editor-pre">
                    <code className="code-block-editor-code" ref={contentRef} />
                </pre>
            </div>
        </CodeBlockContainer>
    );
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CodeBlockExternalHTML(props: any) {
    const language = props.block.props.language || "text";
    return (
        <pre>
            <code
                className={`language-${language}`}
                data-language={language}
                ref={props.contentRef}
            />
        </pre>
    );
}

// ─── Block Spec ─────────────────────────────────────────────────────────────

export const CodeBlock = createReactBlockSpec(
    createBlockConfig(({ defaultLanguage = "text" }: CodeBlockOptions) => ({
        type: "codeBlock" as const,
        propSchema: {
            language: {
                default: defaultLanguage,
            },
        },
        content: "inline" as const,
    })),
    (options: Partial<CodeBlockOptions>) => ({
        render: (props) => <CodeBlockRender {...props} />,
        toExternalHTML: (props) => <CodeBlockExternalHTML {...props} />,
        meta: {
            code: true,
            defining: true,
            isolating: false,
        },
        parse: (element) => {
            if (element.tagName !== "PRE") return undefined;
            if (
                element.childElementCount !== 1 ||
                element.firstElementChild?.tagName !== "CODE"
            ) {
                return undefined;
            }
            const code = element.firstElementChild!;
            const language =
                code.getAttribute("data-language") ||
                code.className
                    .split(" ")
                    .find((name) => name.includes("language-"))
                    ?.replace("language-", "");
            return { language };
        },
    }),
    // Extensions: syntax highlighting + keyboard shortcuts + input rules
    (options: Partial<CodeBlockOptions>) => [
        // Shiki syntax highlighting ProseMirror plugin
        createExtension({
            key: "code-block-shiki-highlighter",
            prosemirrorPlugins: [createShikiHighlightPlugin(options as CodeBlockOptions)],
        }),
        // Keyboard shortcuts and input rules
        createExtension({
            key: "code-block-keyboard-shortcuts",
            keyboardShortcuts: {
                Delete: ({ editor }) => {
                    return editor.transact((tr: any) => {
                        const { block } = editor.getTextCursorPosition();
                        if (block.type !== "codeBlock") return false;
                        const { $from } = tr.selection;
                        if (!$from.parent.textContent) {
                            editor.removeBlocks([block]);
                            return true;
                        }
                        return false;
                    });
                },
                Tab: ({ editor }) => {
                    if (options.indentLineWithTab === false) return false;
                    return editor.transact((tr: any) => {
                        const { block } = editor.getTextCursorPosition();
                        if (block.type === "codeBlock") {
                            tr.insertText("  ");
                            return true;
                        }
                        return false;
                    });
                },
                Enter: ({ editor }) => {
                    return editor.transact((tr: any) => {
                        const { block, nextBlock } = editor.getTextCursorPosition();
                        if (block.type !== "codeBlock") return false;
                        const { $from } = tr.selection;
                        const isAtEnd = $from.parentOffset === $from.parent.nodeSize - 2;
                        const endsWithDoubleNewline = $from.parent.textContent.endsWith("\n\n");
                        if (isAtEnd && endsWithDoubleNewline) {
                            tr.delete($from.pos - 2, $from.pos);
                            if (nextBlock) {
                                editor.setTextCursorPosition(nextBlock, "start");
                                return true;
                            }
                            const [newBlock] = editor.insertBlocks(
                                [{ type: "paragraph" }],
                                block,
                                "after",
                            );
                            editor.setTextCursorPosition(newBlock, "start");
                            return true;
                        }
                        tr.insertText("\n");
                        return true;
                    });
                },
                "Shift-Enter": ({ editor }) => {
                    return editor.transact(() => {
                        const { block } = editor.getTextCursorPosition();
                        if (block.type !== "codeBlock") return false;
                        const [newBlock] = editor.insertBlocks(
                            [{ type: "paragraph" }],
                            block,
                            "after",
                        );
                        editor.setTextCursorPosition(newBlock, "start");
                        return true;
                    });
                },
            },
            inputRules: [
                {
                    find: /^```(.*?)\s$/,
                    replace: ({ match }: { match: RegExpMatchArray }) => {
                        const languageName = match[1].trim();
                        const resolvedLang = getLanguageId(languageName) ?? languageName;
                        return {
                            type: "codeBlock",
                            props: {
                                language: resolvedLang || options.defaultLanguage || "text",
                            },
                            content: [],
                        };
                    },
                },
            ],
        }),
    ] as any[],
);
