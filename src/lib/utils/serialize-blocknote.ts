import { type Block } from "@/components/editor/BlockNoteEditor";

/**
 * Serializes a list of BlockNote blocks into a markdown string.
 * Preserves structure (headings, lists, code, math) and inline formatting.
 */
export function serializeBlockNote(blocks: Block[]): string {
    if (!blocks || blocks.length === 0) return "";

    return blocks.map((block, index) => serializeBlock(block, index, blocks)).join("");
}

/**
 * Serializes a single block into markdown.
 */
function serializeBlock(block: Block, index: number, allBlocks: Block[]): string {
    let content = "";

    // Handle block content based on type
    switch (block.type) {
        case "paragraph":
            content = serializeInlineContent(block.content) + "\n\n";
            break;

        case "heading": {
            const level = (block.props.level as number) || 1;
            const prefix = "#".repeat(Math.min(Math.max(level, 1), 6));
            content = `${prefix} ${serializeInlineContent(block.content)}\n\n`;
            break;
        }

        case "bulletListItem":
            content = `- ${serializeInlineContent(block.content)}\n`;
            break;

        case "numberedListItem": {
            // Calculate the correct number based on preceding numbered items
            let number = 1;
            // Look backwards to find start of list
            for (let i = index - 1; i >= 0; i--) {
                if (allBlocks[i].type === "numberedListItem") {
                    number++;
                } else {
                    break;
                }
            }
            content = `${number}. ${serializeInlineContent(block.content)}\n`;
            break;
        }

        case "checkListItem": {
            const checked = block.props.checked ? "x" : " ";
            content = `- [${checked}] ${serializeInlineContent(block.content)}\n`;
            break;
        }

        case "codeBlock": {
            const language = (block.props.language as string) || "";
            const code = serializeInlineContent(block.content);
            content = `\`\`\`${language}\n${code}\n\`\`\`\n\n`;
            break;
        }

        case "math": {
            const latex = (block.props.latex as string) || "";
            content = `$$\n${latex}\n$$\n\n`;
            break;
        }

        case "image": {
            const url = (block.props.url as string) || "";
            const alt = ((block.props as any).alt as string) || "Image";
            content = `![${alt}](${url})\n\n`;
            break;
        }

        case "divider":
            content = "---\n\n";
            break;

        case "quote":
            content = `> ${serializeInlineContent(block.content)}\n\n`;
            break;

        case "table": {
            // Table serialization is complex, simplified version for now
            // BlockNote tables store rows in content.rows
            const rows = (block.content as any)?.rows;
            if (Array.isArray(rows)) {
                content = serializeTable(rows) + "\n\n";
            }
            break;
        }

        default:
            // Fallback for unknown blocks
            content = serializeInlineContent(block.content) + "\n\n";
            break;
    }

    // Recursively serialize children (nested blocks)
    if (block.children && block.children.length > 0) {
        const childrenContent = serializeBlockNote(block.children as Block[]);
        // Indent children content
        const indentedChildren = childrenContent
            .split("\n")
            .map(line => (line.trim() ? `  ${line}` : line))
            .join("\n");
        content += indentedChildren;
    }

    return content;
}

/**
 * Serializes inline content (text, links, styles) into markdown.
 */
function serializeInlineContent(content: any[] | undefined): string {
    if (!content || !Array.isArray(content)) return "";

    return content.map(item => {
        if (item.type === "link") {
            const text = serializeInlineContent(item.content);
            return `[${text}](${item.href})`;
        }

        if (item.type === "inlineMath") {
            return `$$${item.props.latex}$$`;
        }

        if (item.type === "text") {
            let text = item.text;
            const styles = item.styles || {};

            if (styles.bold) text = `**${text}**`;
            if (styles.italic) text = `_${text}_`;
            if (styles.strike) text = `~~${text}~~`;
            if (styles.code) text = `\`${text}\``;
            // Underline not standard markdown, skipping or could use HTML <u>

            return text;
        }

        return "";
    }).join("");
}

/**
 * Serializes table rows into a markdown table.
 */
function serializeTable(rows: any[]): string {
    if (rows.length === 0) return "";

    // Calculate max columns
    const maxCols = rows.reduce((max, row) => Math.max(max, row.cells.length), 0);

    let tableMd = "";

    rows.forEach((row, rowIndex) => {
        const cells = row.cells.map((cell: any) => {
            // Serialize cell content (which is inline content)
            return serializeInlineContent(cell.content).replace(/\|/g, "\\|"); // Escape pipes
        });

        // Pad cells if needed
        while (cells.length < maxCols) cells.push("");

        tableMd += `| ${cells.join(" | ")} |\n`;

        // Add separator after header (first row)
        if (rowIndex === 0) {
            tableMd += `| ${Array(maxCols).fill("---").join(" | ")} |\n`;
        }
    });

    return tableMd;
}
