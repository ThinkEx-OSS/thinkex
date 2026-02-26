import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { convertMathInBlocks, CURRENCY_PLACEHOLDER } from "./math-helpers";

// Block type from server-util (no custom schema needed)
type ServerBlock = any;

/**
 * Protects escaped currency \$ BEFORE markdown parsing.
 * The markdown parser consumes \ as an escape, turning \$ into bare $.
 * We replace \$ with a placeholder so it survives parsing, then restore to $ in the final blocks.
 */
function protectEscapedCurrencyInMarkdown(markdown: string): string {
  return markdown.replace(/\\\$/g, CURRENCY_PLACEHOLDER);
}

/**
 * Replaces every CURRENCY_PLACEHOLDER occurrence with $ across the entire block tree.
 * Uses JSON round-trip so it catches content arrays, props.latex, nested children, tables, etc.
 *
 * JSON.stringify escapes \u0001 control chars, so we derive the escaped form to search/replace.
 */
function restoreCurrencyInBlocks(blocks: ServerBlock[]): ServerBlock[] {
  const json = JSON.stringify(blocks);
  // JSON.stringify escapes the \u0001 control chars — get the escaped form for matching
  const escaped = JSON.stringify(CURRENCY_PLACEHOLDER).slice(1, -1);
  if (!json.includes(escaped)) return blocks;
  return JSON.parse(json.split(escaped).join("$"));
}

/**
 * Fixes common LLM double-escaping in markdown content.
 * Only targets escape sequences that are unambiguously wrong in markdown context:
 * - Literal \n (two chars) → actual newline, but only when NOT part of a LaTeX command
 *   (e.g. \neq, \nabla, \nu, \newcommand are preserved)
 * - Literal \' → ' (never valid in markdown — apostrophes don't need escaping)
 * Does NOT touch \\ (needed for LaTeX) or \$ (handled separately for currency).
 */
export function fixLLMDoubleEscaping(markdown: string): string {
  const codeBlocks: string[] = [];
  let result = markdown.replace(/```[\s\S]*?```|`[^`\n]+`/g, (m) => {
    codeBlocks.push(m);
    return `\x00CB${codeBlocks.length - 1}\x00`;
  });

  const mathRegions: { start: number; end: number }[] = [];
  const mathPattern = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g;
  let m;
  while ((m = mathPattern.exec(result)) !== null) {
    mathRegions.push({ start: m.index, end: m.index + m[0].length });
  }

  const isInMath = (idx: number) => mathRegions.some((r) => idx >= r.start && idx < r.end);

  // Fix \n → newline only outside math and only when \n is NOT followed by a letter
  // (preserves LaTeX commands like \neq, \nabla, \nu, \not, \newcommand, \nolimits, etc.)
  result = result.replace(/\\n(?![a-zA-Z])/g, (match, offset) => {
    if (isInMath(offset)) return match;
    return "\n";
  });

  // Fix \' → ' outside math
  result = result.replace(/\\'/g, (match, offset) => {
    if (isInMath(offset)) return match;
    return "'";
  });

  result = result.replace(/\x00CB(\d+)\x00/g, (_, i) => codeBlocks[Number(i)]);
  return result;
}

/**
 * Converts markdown content to BlockNote blocks, with comprehensive LaTeX math conversion.
 *
 * Pipeline:
 * 1. Fix LLM double-escaping (literal \n → newline, \' → ')
 * 2. Protect \$ (escaped currency) — the markdown parser would otherwise consume the backslash
 * 3. Parse markdown to BlockNote blocks
 * 4. Convert $$...$$ and $...$ to structured math elements
 * 5. Restore currency placeholder to $ everywhere in the block tree
 *
 * Supports:
 * - Single $...$ for inline math (AI escapes currency as \$)
 * - $$...$$ for block math (display) and inline math
 */
export async function markdownToBlocks(markdown: string): Promise<ServerBlock[]> {
  const fixed = fixLLMDoubleEscaping(markdown);
  const protectedMarkdown = protectEscapedCurrencyInMarkdown(fixed);

  const editor = ServerBlockNoteEditor.create();
  const blocks = await editor.tryParseMarkdownToBlocks(protectedMarkdown);

  const processedBlocks = convertMathInBlocks(blocks);
  return restoreCurrencyInBlocks(processedBlocks);
}

// Re-export for convenience
export { convertMathInBlocks };
