"use client";

import { type Block } from "./BlockNoteEditor";
import { cn } from "@/lib/utils";
import React, { memo, useMemo, useRef, useEffect } from "react";
import katex from "katex";
import { useVirtualizer } from "@tanstack/react-virtual";
import "katex/dist/katex.min.css";
import ShikiHighlighter from "react-shiki";

const LazyMathField = memo(function LazyMathField({ latex, isInline = false }: { latex: string; isInline?: boolean }) {
    const html = useMemo(() => {
        try {
            return katex.renderToString(latex, {
                displayMode: !isInline,
                throwOnError: false,
                strict: false,
            });
        } catch (error) {
            return `<span>${latex}</span>`;
        }
    }, [latex, isInline]);

    if (isInline) {
        return (
            <span
                className="inline-block align-middle mx-1"
                dangerouslySetInnerHTML={{ __html: html }}
                style={{ fontSize: '1.15em' }}
            />
        );
    }

    return (
        <div
            className="my-4 flex justify-center"
            dangerouslySetInnerHTML={{ __html: html }}
            style={{ fontSize: '1.4em' }}
        />
    );
}, (prevProps, nextProps) => {
    // Strict comparison - only re-render if props actually changed
    return prevProps.latex === nextProps.latex && prevProps.isInline === nextProps.isInline;
});

interface BlockNotePreviewProps {
    blocks: Block[];
    className?: string;
    isScrollLocked?: boolean; // Whether scrolling is locked (overflow hidden)
    scrollParent?: HTMLElement | null; // Reference to the parent scroll container
    maxBlocks?: number; // Optional limit on number of blocks to render (for performance when content is clipped)
}

export const BlockNotePreview = memo(function BlockNotePreview({ blocks, className, isScrollLocked = true, scrollParent }: BlockNotePreviewProps) {
    const parentRef = useRef<HTMLDivElement>(null);

    // Use custom scroll parent if provided, otherwise use the container's own scroll
    const scrollElement = scrollParent || parentRef.current;

    const virtualizer = useVirtualizer({
        count: blocks.length,
        getScrollElement: () => scrollElement,
        estimateSize: () => 50, // Estimate 50px per block (will be measured dynamically)
        overscan: isScrollLocked ? 0 : 15, // No overscan when locked, 15 when unlocked for smoother scrolling
    });

    // Update virtualizer when scroll parent changes
    useEffect(() => {
        if (scrollElement) {
            virtualizer.measure();
        }
    }, [scrollElement, virtualizer]);

    if (!blocks || blocks.length === 0) return null;

    return (
        <div
            ref={parentRef}
            style={{
                height: '100%',
                overflow: scrollParent ? 'visible' : 'auto',
                scrollbarGutter: 'stable both-edges',
                scrollbarColor: 'rgba(255, 255, 255, 0.5) transparent',
                scrollbarWidth: 'thin'
            }}
            className={cn(
                "blocknote-preview text-sm text-foreground/90",
                "[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/50 hover:[&::-webkit-scrollbar-thumb]:bg-white/80 [&::-webkit-scrollbar-thumb]:rounded-full",
                className
            )}
        >
            <div
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                }}
            >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                    const block = blocks[virtualItem.index];
                    return (
                        <div
                            key={virtualItem.key}
                            data-index={virtualItem.index}
                            ref={virtualizer.measureElement}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                transform: `translateY(${virtualItem.start}px)`,
                            }}
                        >
                            <PreviewBlock block={block} index={virtualItem.index} blocks={blocks} isScrollLocked={isScrollLocked} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    // Fast path: same reference means no change
    if (prevProps.blocks === nextProps.blocks &&
        prevProps.className === nextProps.className &&
        prevProps.isScrollLocked === nextProps.isScrollLocked &&
        prevProps.scrollParent === nextProps.scrollParent) return true;

    // If references changed, we should re-render to ensure content updates are reflected
    // The previous optimization was too aggressive and missed content changes where ID/type remained same
    return false;
});

// Helper function to extract text from inline content
function extractTextFromInlineContent(content: any[]): string {
    if (!content || !Array.isArray(content)) return "";
    return content
        .map((item: any) => {
            if (item.type === "text") return item.text || "";
            if (item.type === "link" && item.content) {
                return item.content.map((subItem: any) => subItem.text || "").join("");
            }
            return "";
        })
        .join("");
}

export const PreviewBlock = memo(function PreviewBlock({ block, index, blocks, isScrollLocked = true }: { block: Block; index: number; blocks: Block[]; isScrollLocked?: boolean }) {
    // Cast content to any to avoid strict type checking issues with BlockNote types
    const content = block.content as any;
    const children = block.children;

    // OPTIMIZED: Memoize children rendering with stable dependency
    const childrenArray = useMemo(() => {
        if (!children || children.length === 0) return null;
        return children as Block[];
    }, [children]);

    const renderChildren = useMemo(() => {
        if (!childrenArray || childrenArray.length === 0) return null;
        return (
            <div className="mt-1 pl-4">
                {childrenArray.map((child, childIndex) => (
                    <PreviewBlock key={child.id} block={child as Block} index={childIndex} blocks={childrenArray} isScrollLocked={isScrollLocked} />
                ))}
            </div>
        );
    }, [childrenArray, isScrollLocked]);

    switch (block.type) {
        case "paragraph":
            // Skip rendering if content is empty and there are no children
            if ((!content || !Array.isArray(content) || content.length === 0) && (!childrenArray || childrenArray.length === 0)) {
                return null;
            }
            return (
                <div className="mb-2 min-h-[1.5em] break-words text-foreground dark:text-white">
                    <InlineContent content={content} />
                    {renderChildren}
                </div>
            );

        case "heading": {
            const level = block.props.level as 1 | 2 | 3 | 4 | 5 | 6;
            const Tag = `h${level}` as React.ElementType;
            const sizes = {
                1: "text-2xl font-bold mt-3 mb-2",
                2: "text-xl font-bold mt-2 mb-1.5",
                3: "text-lg font-semibold mt-2 mb-1",
                4: "text-base font-semibold mt-1.5 mb-1",
                5: "text-sm font-semibold mt-1 mb-0.5",
                6: "text-sm font-medium mt-1 mb-0.5",
            };
            return (
                <div className="break-words">
                    <Tag className={`${sizes[level]} min-h-[1.2em]`}>
                        <InlineContent content={content} />
                    </Tag>
                    {renderChildren}
                </div>
            );
        }

        case "bulletListItem":
            return (
                <div className="mb-1">
                    <div className="flex gap-2 items-center">
                        <span className="select-none text-muted-foreground">•</span>
                        <div className="flex-1 min-w-0 break-words">
                            <p><InlineContent content={content} /></p>
                        </div>
                    </div>
                    {renderChildren}
                </div>
            );

        case "numberedListItem": {
            // Calculate the list number by counting how many consecutive numberedListItem blocks
            // appear before this one (starting from the beginning of the list)
            // For nested lists, each nested list restarts numbering from 1
            let listNumber = 1;

            // Count backwards to find where the list starts
            let startIndex = index;
            for (let i = index - 1; i >= 0; i--) {
                if (blocks[i]?.type === "numberedListItem") {
                    startIndex = i;
                } else {
                    break; // Stop when we hit a non-numbered-list item
                }
            }

            // Calculate position from the start of the list
            listNumber = index - startIndex + 1;

            return (
                <div className="mb-1">
                    <div className="flex gap-2 items-center">
                        <span className="select-none text-muted-foreground font-mono text-xs">{listNumber}.</span>
                        <div className="flex-1 min-w-0 break-words">
                            <p><InlineContent content={content} /></p>
                        </div>
                    </div>
                    {renderChildren}
                </div>
            );
        }

        case "checkListItem":
            return (
                <div className="mb-1">
                    <div className="flex gap-2 items-start">
                        <div className="mt-0.5">
                            <input
                                type="checkbox"
                                checked={block.props.checked as boolean}
                                disabled
                                className="h-4 w-4 rounded border-border text-accent focus:ring-accent/50 focus:ring-2"
                            />
                        </div>
                        <div className={`flex-1 min-w-0 break-words ${(block.props.checked) ? "line-through text-muted-foreground" : ""}`}>
                            <p><InlineContent content={content} /></p>
                        </div>
                    </div>
                    {renderChildren}
                </div>
            );

        case "table": {
            const rows = block.content.rows as any[];
            return (
                <div className="my-4">
                    <table className="border-collapse border border-white/30 text-sm w-full">
                        <tbody>
                            {rows.map((row, rowIndex) => (
                                <tr key={rowIndex} className="border-b border-white/30 last:border-0">
                                    {row.cells.map((cell: any, cellIndex: number) => (
                                        <td
                                            key={cellIndex}
                                            className="p-2 border-r border-white/30 last:border-0 align-top"
                                            colSpan={cell.props?.colspan || 1}
                                            rowSpan={cell.props?.rowspan || 1}
                                            style={{
                                                textAlign: cell.props?.textAlignment || 'left',
                                                backgroundColor: cell.props?.backgroundColor !== 'default' ? cell.props?.backgroundColor : undefined,
                                            }}
                                        >
                                            <InlineContent content={cell.content} />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {renderChildren}
                </div>
            );
        }

        case "image":
            return (
                <div className="my-4 min-h-[50px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={block.props.url as string}
                        alt="Embedded content"
                        className="rounded-md max-w-full min-h-[50px]"
                        style={{ width: block.props.previewWidth ? `${block.props.previewWidth}px` : '100%' }}
                    />
                    {renderChildren}
                </div>
            );

        case "codeBlock": {
            const codeText = extractTextFromInlineContent(content);
            const language = (block.props.language as string) || "text";

            return (
                <div className="my-2 rounded-md bg-muted border border-border overflow-hidden">
                    <div className="px-3 py-1.5 bg-muted border-b border-border text-xs text-muted-foreground font-mono">
                        {language}
                    </div>
                    <div className="[&_pre]:!m-0 [&_pre]:!p-3 [&_pre]:!bg-muted [&_pre]:!text-sm [&_pre]:!overflow-x-visible">
                        <ShikiHighlighter
                            language={language}
                            theme="one-dark-pro"
                            addDefaultStyles={false}
                            showLanguage={false}
                        >
                            {codeText}
                        </ShikiHighlighter>
                    </div>
                    {renderChildren}
                </div>
            );
        }

        case "math":
            return (
                <div className="flex justify-center">
                    <LazyMathField latex={block.props.latex as string} isInline={false} />
                    {renderChildren}
                </div>
            );

        case "divider":
            return (
                <div>
                    <hr className="border-t border-white/30" />
                    {renderChildren}
                </div>
            );

        case "quote":
            return (
                <blockquote className="my-2 pl-4 border-l-2 border-white/30 italic text-foreground/80">
                    <InlineContent content={content} />
                    {renderChildren}
                </blockquote>
            );

        default:
            // Fallback for unknown blocks
            return (
                <div className="mb-2 min-h-[1.5em]">
                    <p><InlineContent content={content} /></p>
                    {renderChildren}
                </div>
            );
    }
}, (prevProps, nextProps) => {
    // Fast path: same block reference means no change
    if (prevProps.block === nextProps.block && prevProps.index === nextProps.index && prevProps.blocks === nextProps.blocks && prevProps.isScrollLocked === nextProps.isScrollLocked) return true;

    // Memoize based on block ID, type, props, and content
    if (prevProps.block.id !== nextProps.block.id) return false;
    if (prevProps.block.type !== nextProps.block.type) return false;
    if (prevProps.index !== nextProps.index) return false;
    if (prevProps.isScrollLocked !== nextProps.isScrollLocked) return false;

    // OPTIMIZED: Fast shallow checks before expensive JSON.stringify
    const prevContent = prevProps.block.content as any[];
    const nextContent = nextProps.block.content as any[];
    if (prevContent?.length !== nextContent?.length) return false;

    const prevChildren = prevProps.block.children as any[];
    const nextChildren = nextProps.block.children as any[];
    if (prevChildren?.length !== nextChildren?.length) return false;

    // Only do JSON.stringify if lengths match
    if (JSON.stringify(prevProps.block.content) !== JSON.stringify(nextProps.block.content)) return false;
    if (JSON.stringify(prevProps.block.props) !== JSON.stringify(nextProps.block.props)) return false;
    if (JSON.stringify(prevProps.block.children) !== JSON.stringify(nextProps.block.children)) return false;

    // Only compare blocks array length, not full array (blocks is mainly for numbered list calculation)
    // OPTIMIZED: Only check length, not reference (blocks array reference might change but content is same)
    if (prevProps.blocks.length !== nextProps.blocks.length) return false;

    return true; // Props are equal, skip re-render
});

const InlineContent = memo(function InlineContent({ content }: { content: any[] }) {
    if (!content || !Array.isArray(content)) return null;

    return (
        <>
            {content.map((item, index) => {
                if (item.type === "link") {
                    return (
                        <a
                            key={index}
                            href={item.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline underline-offset-2"
                        >
                            {item.content.map((subItem: any, subIndex: number) => (
                                <StyledText key={subIndex} text={subItem.text} styles={subItem.styles} />
                            ))}
                        </a>
                    );
                }

                if (item.type === "inlineMath") {
                    return (
                        <span key={index} className="inline-block align-middle mx-1">
                            <LazyMathField latex={item.props.latex} isInline={true} />
                        </span>
                    );
                }

                if (item.type === "text") {
                    return <StyledText key={index} text={item.text} styles={item.styles} />;
                }

                return null;
            })}
        </>
    );
}, (prevProps, nextProps) => {
    // OPTIMIZED: Fast comparison - check array reference first (most common case)
    if (prevProps.content === nextProps.content) return true; // Same reference = no change

    // Handle null/undefined cases
    if (!prevProps.content || !nextProps.content) {
        return prevProps.content === nextProps.content;
    }

    // Fast length check
    if (prevProps.content.length !== nextProps.content.length) return false;

    // OPTIMIZED: For empty arrays, they're equal
    if (prevProps.content.length === 0) return true;

    // Shallow comparison of items (most content arrays are small)
    // This is the critical path - most re-renders happen here unnecessarily
    for (let i = 0; i < prevProps.content.length; i++) {
        const prev = prevProps.content[i];
        const next = nextProps.content[i];

        // Fast reference check - if same object reference, skip detailed comparison
        if (prev === next) continue;

        if (prev.type !== next.type) return false;
        if (prev.text !== next.text) return false;
        if (prev.href !== next.href) return false;

        // Compare props for inlineMath
        if (prev.type === "inlineMath") {
            if (prev.props?.latex !== next.props?.latex) return false;
        }

        // OPTIMIZED: Compare styles object more efficiently
        // Check if both are undefined/null first
        if (!prev.styles && !next.styles) {
            // Both are empty, continue
        } else if (!prev.styles || !next.styles) {
            return false; // One is empty, other is not
        } else {
            // Both have styles, compare properties
            const prevStyles = prev.styles;
            const nextStyles = next.styles;
            if (
                prevStyles.bold !== nextStyles.bold ||
                prevStyles.italic !== nextStyles.italic ||
                prevStyles.underline !== nextStyles.underline ||
                prevStyles.strike !== nextStyles.strike ||
                prevStyles.code !== nextStyles.code ||
                prevStyles.textColor !== nextStyles.textColor ||
                prevStyles.backgroundColor !== nextStyles.backgroundColor
            ) return false;
        }

        // Compare nested content for links
        if (prev.type === "link") {
            if (!prev.content && !next.content) continue;
            if (!prev.content || !next.content) return false;
            if (prev.content.length !== next.content.length) return false;

            for (let j = 0; j < prev.content.length; j++) {
                const prevSub = prev.content[j];
                const nextSub = next.content[j];

                // Fast reference check
                if (prevSub === nextSub) continue;

                if (prevSub.text !== nextSub.text) return false;

                // Compare styles more efficiently
                if (!prevSub.styles && !nextSub.styles) continue;
                if (!prevSub.styles || !nextSub.styles) return false;
                if (JSON.stringify(prevSub.styles) !== JSON.stringify(nextSub.styles)) return false;
            }
        }
    }

    return true; // Props are equal, skip re-render
});

const StyledText = memo(function StyledText({ text, styles }: { text: string; styles: any }) {
    const element = useMemo(() => {
        let el = <>{text}</>;

        if (styles?.bold) {
            el = <strong>{el}</strong>;
        }
        if (styles?.italic) {
            el = <em>{el}</em>;
        }
        if (styles?.underline) {
            el = <u>{el}</u>;
        }
        if (styles?.strike) {
            el = <s>{el}</s>;
        }
        if (styles?.code) {
            el = <code className="bg-foreground/10 px-1 py-0.5 rounded font-mono text-foreground dark:bg-white/10 dark:text-white">{el}</code>;
        }
        if (styles?.textColor) {
            el = <span style={{ color: styles.textColor }}>{el}</span>;
        }
        if (styles?.backgroundColor) {
            el = <span style={{ backgroundColor: styles.backgroundColor }}>{el}</span>;
        }

        return el;
    }, [text, styles?.bold, styles?.italic, styles?.underline, styles?.strike, styles?.code, styles?.textColor, styles?.backgroundColor]);

    return element;
}, (prevProps, nextProps) => {
    // OPTIMIZED: Fast comparison - check text first, then compare style properties directly
    if (prevProps.text !== nextProps.text) return false;

    const prevStyles = prevProps.styles || {};
    const nextStyles = nextProps.styles || {};

    // Direct property comparison (faster than JSON.stringify)
    return (
        prevStyles.bold === nextStyles.bold &&
        prevStyles.italic === nextStyles.italic &&
        prevStyles.underline === nextStyles.underline &&
        prevStyles.strike === nextStyles.strike &&
        prevStyles.code === nextStyles.code &&
        prevStyles.textColor === nextStyles.textColor &&
        prevStyles.backgroundColor === nextStyles.backgroundColor
    );
});
