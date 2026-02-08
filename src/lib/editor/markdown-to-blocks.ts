import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { convertMathInBlocks } from "./math-helpers";

// Block type from server-util (no custom schema needed)
type ServerBlock = any;

/**
 * Converts markdown content to BlockNote blocks, with comprehensive LaTeX math conversion.
 * 
 * Process:
 * 1. Parse markdown to BlockNote blocks
 * 2. Post-process blocks to:
 *    - Convert paragraphs that contain ONLY $$...$$ to block math
 *    - Convert $$...$$ within text to inlineMath elements
 * 
 * Note: Streamdown uses $$ for BOTH inline and block math.
 * - Inline math: $$...$$ on the same line as text
 * - Block math: $$...$$ alone on a line (centered, display mode)
 * - Single $ is ONLY for currency, never for math
 */
export async function markdownToBlocks(markdown: string): Promise<ServerBlock[]> {
  // Parse markdown to blocks using BlockNote (use defaults to avoid ProseMirror duplication)
  const editor = ServerBlockNoteEditor.create();
  const blocks = await editor.tryParseMarkdownToBlocks(markdown);

  // Post-process blocks to convert $$...$$ to math elements
  const processedBlocks = convertMathInBlocks(blocks);

  return processedBlocks;
}

// Re-export for convenience if needed, though mostly used internally or by BlockNoteEditor
export { convertMathInBlocks };
