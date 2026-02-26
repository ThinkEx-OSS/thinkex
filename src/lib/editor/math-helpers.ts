// Type definition to avoid dependency on server-util
export type MathBlock = any;

// Placeholder used by markdown-to-blocks to protect \$ before the markdown parser strips \.
// Contains no $ so math regexes naturally skip it.
export const CURRENCY_PLACEHOLDER = "\u0001CURRENCY_DOLLAR\u0001";

// $$...$$ as the only content of a paragraph → block (display) math
const BLOCK_MATH_ONLY_REGEX = /^\s*\$\$([\s\S]+?)\$\$\s*$/;

// Inline: $$...$$ (group 1) or $...$ (group 2)
const COMBINED_MATH_REGEX = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

// Bare currency ($5, $19.99, $1,000.50) — defensive fallback when AI forgets to escape.
// Must not be preceded by another $ (avoids matching inside $$..$$).
const BARE_CURRENCY_REGEX = /(?<!\$)\$(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\b/g;

/**
 * Converts math delimiters in blocks to structured math elements.
 * - Paragraph containing ONLY $$...$$ → block math
 * - $$...$$ or $...$ inline → inlineMath content nodes
 * - Bare currency ($5, $19.99) is protected from false-positive math matching
 */
export function convertMathInBlocks(blocks: MathBlock[]): MathBlock[] {
    const result: MathBlock[] = [];
    for (const block of blocks) {
        const processed = processBlockForMath(block);
        if (Array.isArray(processed)) {
            result.push(...processed);
        } else {
            result.push(processed);
        }
    }
    return result;
}

function processBlockForMath(block: MathBlock): MathBlock | MathBlock[] {
    if (block.type === "paragraph" && block.content && Array.isArray(block.content)) {
        const fullText = block.content
            .filter((item: any) => item.type === "text")
            .map((item: any) => item.text || "")
            .join("");

        // Only $$...$$ alone in a paragraph becomes block math (never single $)
        const hasNonTextContent = block.content.some((item: any) => item.type !== "text");
        const blockMathMatch = !hasNonTextContent && fullText.match(BLOCK_MATH_ONLY_REGEX);
        if (blockMathMatch) {
            return {
                id: block.id,
                type: "math",
                props: { latex: blockMathMatch[1].trim() },
                children: [],
            };
        }

        const { content: processedContent, changed } = processInlineMathInContent(block.content);
        if (changed) {
            return {
                ...block,
                content: processedContent,
                children: block.children ? processChildBlocks(block.children) : [],
            };
        }
    }

    let processedBlock = { ...block };

    if (block.content && Array.isArray(block.content) && block.type !== "paragraph") {
        const { content: processedContent, changed } = processInlineMathInContent(block.content);
        if (changed) {
            processedBlock = { ...processedBlock, content: processedContent };
        }
    }

    // Process table cells (special structure)
    if (block.type === "table" && block.content) {
        let rows: any[] = [];

        if (Array.isArray(block.content)) {
            rows = block.content;
        } else if (block.content && typeof block.content === 'object' && 'rows' in block.content) {
            rows = (block.content as any).rows || [];
        }

        if (rows.length > 0) {
            const processedRows = rows.map((row: any) => {
                if (!row || !row.cells || !Array.isArray(row.cells)) return row;

                const processedCells = row.cells.map((cell: any) => {
                    if (!cell || !cell.content || !Array.isArray(cell.content)) return cell;

                    const { content: processedCellContent } = processInlineMathInContent(cell.content);

                    const fullyProcessedContent = processedCellContent.map((item: any) => {
                        if (item && typeof item === 'object' && 'type' in item && 'id' in item && item.children) {
                            const result = processBlockForMath(item);
                            return Array.isArray(result) ? result[0] : result;
                        }
                        return item;
                    });

                    return { ...cell, content: fullyProcessedContent };
                });

                return { ...row, cells: processedCells };
            });

            const processedTableContent = Array.isArray(block.content)
                ? processedRows
                : { ...(block.content as any), rows: processedRows };

            processedBlock = { ...processedBlock, content: processedTableContent };
        }
    }

    if (block.children && Array.isArray(block.children) && block.children.length > 0) {
        processedBlock = { ...processedBlock, children: processChildBlocks(block.children) };
    }

    return processedBlock;
}

function processChildBlocks(blocks: MathBlock[]): MathBlock[] {
    const result: MathBlock[] = [];
    for (const block of blocks) {
        const processed = processBlockForMath(block);
        if (Array.isArray(processed)) {
            result.push(...processed);
        } else {
            result.push(processed);
        }
    }
    return result;
}

/**
 * Finds $...$ and $$...$$ math in inline content and converts to inlineMath nodes.
 * Bare currency patterns ($5, $19.99) are stashed before matching so they aren't
 * mis-identified as math delimiters.
 */
function processInlineMathInContent(
    content: Array<{ type: string; text?: string;[key: string]: any }>
): { content: Array<any>; changed: boolean } {
    const processed: any[] = [];
    let changed = false;

    for (const item of content) {
        if (item.type !== "text" || !item.text) {
            processed.push(item);
            continue;
        }

        // Stash bare currency so the math regex skips them
        const stash: string[] = [];
        const text = item.text.replace(BARE_CURRENCY_REGEX, (m) => {
            stash.push(m);
            return `\x00BC${stash.length - 1}\x00`;
        });
        const unstash = (s: string) =>
            s.replace(/\x00BC(\d+)\x00/g, (_, i) => stash[Number(i)]);

        // Preserve styles / other props on text fragments
        const extraProps = Object.fromEntries(
            Object.entries(item).filter(([k]) => k !== "type" && k !== "text")
        );

        const parts: any[] = [];
        let lastIndex = 0;
        let hasMath = false;

        COMBINED_MATH_REGEX.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = COMBINED_MATH_REGEX.exec(text)) !== null) {
            const latex = (match[1] ?? match[2])?.trim();
            if (!latex) continue;
            hasMath = true;

            if (match.index > lastIndex) {
                parts.push({ type: "text", text: unstash(text.slice(lastIndex, match.index)), ...extraProps });
            }
            parts.push({ type: "inlineMath", props: { latex } });
            lastIndex = match.index + match[0].length;
        }

        if (hasMath) {
            if (lastIndex < text.length) {
                parts.push({ type: "text", text: unstash(text.slice(lastIndex)), ...extraProps });
            }
            changed = true;
            processed.push(...parts);
        } else {
            processed.push(item);
        }
    }

    return { content: processed, changed };
}
