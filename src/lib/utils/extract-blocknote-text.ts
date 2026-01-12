/**
 * Extracts plain text from BlockNote selection blocks
 * Handles various block types including paragraphs, headings, and nested content
 */

// Use any for flexibility with BlockNote's complex types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BlockNoteBlock = any;

// Use any for flexibility with BlockNote's Selection type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BlockNoteSelection = any;

/**
 * Extracts text from a single block's content array
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTextFromBlockContent(content: any): string {
  if (!Array.isArray(content)) return "";

  return content
    .map((node) => {
      // Handle text nodes
      if (node && node.type === "text" && typeof node.text === "string") {
        return node.text;
      }
      // Handle inline math - extract LaTeX
      if (node && node.type === "inlineMath" && node.props && typeof node.props.latex === "string") {
        return `$${node.props.latex}$`;
      }
      // Handle other inline content types
      if (node && typeof node.text === "string") {
        return node.text;
      }
      return "";
    })
    .join("");
}

/**
 * Recursively extracts text from a block and its children
 */
function extractTextFromBlock(block: BlockNoteBlock): string {
  if (!block || typeof block !== "object") return "";

  const parts: string[] = [];

  // Extract text from main content
  if (block.content) {
    const contentText = extractTextFromBlockContent(block.content);
    if (contentText) {
      parts.push(contentText);
    }
  }

  // Handle block math - extract LaTeX
  if (block.type === "math" && block.props && typeof block.props.latex === "string") {
    parts.push(`$${block.props.latex}$`);
  }

  // Recursively extract from children
  if (block.children && Array.isArray(block.children)) {
    const childrenText = block.children
      .map((child: BlockNoteBlock) => extractTextFromBlock(child))
      .filter(Boolean)
      .join("\n");
    if (childrenText) {
      parts.push(childrenText);
    }
  }

  return parts.join(parts.length > 1 ? "\n" : "");
}

/**
 * Extracts plain text from a BlockNote Selection object
 * @param selection - BlockNote Selection object with blocks array
 * @returns Extracted plain text, trimmed
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractTextFromSelection(selection: any): string {
  if (!selection || !selection.blocks || !Array.isArray(selection.blocks)) {
    return "";
  }

  const text = selection.blocks
    .map((block: BlockNoteBlock) => extractTextFromBlock(block))
    .filter(Boolean)
    .join("\n")
    .trim();

  return text;
}
