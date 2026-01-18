import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { normalizeMathSyntax, convertMathInBlocks } from "./math-utils";

// Block type from server-util (no custom schema needed)
type ServerBlock = any;

/**
 * Converts markdown content to BlockNote blocks, with comprehensive LaTeX math conversion.
 * 
 * Process:
 * 1. Normalize math syntax (e.g., \[...\] to $$...$$, \(...\) to $$...$$)
 * 2. Parse markdown to BlockNote blocks
 * 3. Post-process blocks to:
 *    - Convert paragraphs that contain ONLY $$...$$ to block math
 *    - Convert $$...$$ within text to inlineMath elements
 * 
 * Note: Streamdown uses $$ for BOTH inline and block math.
 * - Inline math: $$...$$ on the same line as text
 * - Block math: $$...$$ alone on a line (centered, display mode)
 * - Single $ is ONLY for currency, never for math
 */
export async function markdownToBlocks(markdown: string): Promise<ServerBlock[]> {
  // Normalize LaTeX syntax to standard $$ delimiters (Streamdown format)
  const normalizedMarkdown = normalizeMathSyntax(markdown);

  // Parse markdown to blocks using BlockNote (use defaults to avoid ProseMirror duplication)
  const editor = ServerBlockNoteEditor.create();
  const blocks = await editor.tryParseMarkdownToBlocks(normalizedMarkdown);

  // Post-process blocks to convert $$...$$ to math elements
  const processedBlocks = convertMathInBlocks(blocks);

  return processedBlocks;
}

