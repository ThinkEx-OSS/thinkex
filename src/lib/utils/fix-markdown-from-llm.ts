/**
 * Fixes common LLM double-escaping in markdown content.
 * Only targets escape sequences that are unambiguously wrong in markdown context:
 * - Literal \n (two chars) -> actual newline, but only when NOT part of a LaTeX command
 *   (e.g. \neq, \nabla, \nu, \newcommand are preserved)
 * - Literal \' -> ' (never valid in markdown; apostrophes do not need escaping)
 * Does NOT touch \\ (needed for LaTeX) or \$ (needed for currency / math content).
 */
export function fixLLMDoubleEscaping(markdown: string): string {
  const codeBlocks: string[] = [];
  let result = markdown.replace(/```[\s\S]*?```|`[^`\n]+`/g, (match) => {
    codeBlocks.push(match);
    return `\x00CB${codeBlocks.length - 1}\x00`;
  });

  const mathRegions: { start: number; end: number }[] = [];
  const mathPattern = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g;
  let match: RegExpExecArray | null;
  while ((match = mathPattern.exec(result)) !== null) {
    mathRegions.push({ start: match.index, end: match.index + match[0].length });
  }

  const isInMath = (idx: number) =>
    mathRegions.some((region) => idx >= region.start && idx < region.end);

  // Fix \n -> newline only outside math and only when \n is NOT followed by a letter.
  result = result.replace(/\\n(?![a-zA-Z])/g, (value, offset) => {
    if (isInMath(offset)) return value;
    return "\n";
  });

  // Fix \' -> ' outside math.
  result = result.replace(/\\'/g, (value, offset) => {
    if (isInMath(offset)) return value;
    return "'";
  });

  return result.replace(/\x00CB(\d+)\x00/g, (_, i) => codeBlocks[Number(i)]);
}
