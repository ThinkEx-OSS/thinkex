// Type definition to avoid dependency on server-util
export type MathBlock = any;

/**
 * Normalizes various LaTeX math syntaxes to standard $$ format (Streamdown compatible)
 * This ensures math is preserved in the BlockNote document
 */
export function normalizeMathSyntax(markdown: string): string {
    return markdown
        // Convert \[...\] to $$...$$ (block math)
        .replace(/\\\[([\s\S]*?)\\\]/g, (_, latex) => `$$${latex.trim()}$$`)
        // Convert \(...\) to $$...$$ (inline math) - Streamdown uses $$ for both
        .replace(/\\\(([\s\S]*?)\\\)/g, (_, latex) => `$$${latex.trim()}$$`)
        // Keep existing $$...$$ as-is
        ;
}

/**
 * Regex pattern for matching Streamdown math: $$...$$
 * Matches $$ delimiters with content in between (non-greedy)
 */
const MATH_REGEX = /\$\$([\s\S]+?)\$\$/g;

/**
 * Regex to check if content is ONLY a single math expression (for block math detection)
 * Matches: optional whitespace + $$...$$ + optional whitespace
 */
const BLOCK_MATH_ONLY_REGEX = /^\s*\$\$([\s\S]+?)\$\$\s*$/;

/**
 * Converts math in blocks:
 * - Paragraphs with ONLY $$...$$ become block math
 * - $$...$$ within text becomes inlineMath
 */
export function convertMathInBlocks(blocks: MathBlock[]): MathBlock[] {
    const result: MathBlock[] = [];

    for (const block of blocks) {
        const processed = processBlockForMath(block);
        // processBlockForMath can return one block or an array of blocks
        if (Array.isArray(processed)) {
            result.push(...processed);
        } else {
            result.push(processed);
        }
    }

    return result;
}

/**
 * Process a single block for math conversion.
 * Returns the processed block(s) - may return multiple blocks if splitting is needed.
 */
function processBlockForMath(block: MathBlock): MathBlock | MathBlock[] {
    // Check if this is a paragraph that should become a math block
    if (block.type === "paragraph" && block.content && Array.isArray(block.content)) {
        // Get the full text content of the paragraph
        const fullText = block.content
            .filter((item: any) => item.type === "text")
            .map((item: any) => item.text || "")
            .join("");

        // Check if the paragraph contains ONLY a single math expression
        // AND does not contain any non-text inline content (links, mentions, etc.)
        const hasNonTextContent = block.content.some((item: any) => item.type !== "text");
        const blockMathMatch = !hasNonTextContent && fullText.match(BLOCK_MATH_ONLY_REGEX);
        if (blockMathMatch) {
            // Convert to block math
            const latex = blockMathMatch[1].trim();
            return {
                id: block.id,
                type: "math",
                props: {
                    latex: latex,
                },
                children: [],
            };
        }

        // Otherwise, process inline math within the paragraph content
        const processedContent = processInlineMathInContent(block.content);
        const contentChanged = JSON.stringify(processedContent) !== JSON.stringify(block.content);

        if (contentChanged) {
            return {
                ...block,
                content: processedContent,
                children: block.children ? processChildBlocks(block.children) : [],
            };
        }
    }

    // For other block types, process their content for inline math
    let processedBlock = { ...block };

    // Process inline content (for headings, list items, etc.)
    if (block.content && Array.isArray(block.content) && block.type !== "paragraph") {
        const processedContent = processInlineMathInContent(block.content);
        const contentChanged = JSON.stringify(processedContent) !== JSON.stringify(block.content);
        if (contentChanged) {
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

                    const processedCellContent = processInlineMathInContent(cell.content);

                    const fullyProcessedContent = processedCellContent.map((item: any) => {
                        if (item && typeof item === 'object' && 'type' in item && 'id' in item && item.children) {
                            const result = processBlockForMath(item);
                            return Array.isArray(result) ? result[0] : result;
                        }
                        return item;
                    });

                    return {
                        ...cell,
                        content: fullyProcessedContent,
                    };
                });

                return {
                    ...row,
                    cells: processedCells,
                };
            });

            const processedTableContent = Array.isArray(block.content)
                ? processedRows
                : { ...(block.content as any), rows: processedRows };

            processedBlock = {
                ...processedBlock,
                content: processedTableContent,
            };
        }
    }

    // Recursively process children
    if (block.children && Array.isArray(block.children) && block.children.length > 0) {
        processedBlock = {
            ...processedBlock,
            children: processChildBlocks(block.children),
        };
    }

    return processedBlock;
}

/**
 * Process an array of child blocks recursively.
 */
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
 * Processes Streamdown math patterns ($$...$$) in inline content array.
 * Splits text items that contain math and converts them to inlineMath elements.
 * 
 * Note: This is for inline math only - block math is handled at the block level.
 * 
 * Example:
 * Input: [{ type: "text", text: "The equation $$E=mc^2$$ is famous." }]
 * Output: [
 *   { type: "text", text: "The equation " },
 *   { type: "inlineMath", props: { latex: "E=mc^2" } },
 *   { type: "text", text: " is famous." }
 * ]
 */
function processInlineMathInContent(
    content: Array<{ type: string; text?: string;[key: string]: any }>
): Array<any> {
    const processed: any[] = [];

    for (const item of content) {
        if (item.type === "text" && item.text) {
            const text = item.text;
            const parts: Array<{ type: string; text?: string; props?: { latex: string } }> = [];
            let lastIndex = 0;

            // Find all math matches
            let match: RegExpExecArray | null;
            MATH_REGEX.lastIndex = 0; // Reset regex

            while ((match = MATH_REGEX.exec(text)) !== null) {
                const matchStart = match.index;
                const matchEnd = match.index + match[0].length;
                const latex = match[1].trim();

                // Add text before the math
                if (matchStart > lastIndex) {
                    const beforeText = text.substring(lastIndex, matchStart);
                    if (beforeText) {
                        parts.push({
                            type: "text",
                            text: beforeText,
                            // Preserve other properties (styles, etc.)
                            ...Object.fromEntries(
                                Object.entries(item).filter(([key]) => key !== "type" && key !== "text")
                            ),
                        });
                    }
                }

                // Add inline math element
                parts.push({
                    type: "inlineMath",
                    props: { latex },
                });

                lastIndex = matchEnd;
            }

            // Add remaining text after last match
            if (lastIndex < text.length) {
                const afterText = text.substring(lastIndex);
                if (afterText) {
                    parts.push({
                        type: "text",
                        text: afterText,
                        // Preserve other properties
                        ...Object.fromEntries(
                            Object.entries(item).filter(([key]) => key !== "type" && key !== "text")
                        ),
                    });
                }
            }

            // If we found math, use processed parts; otherwise keep original item
            if (parts.length > 0) {
                processed.push(...parts);
            } else {
                processed.push(item);
            }
        } else {
            // Non-text items are kept as-is
            processed.push(item);
        }
    }

    return processed;
}
