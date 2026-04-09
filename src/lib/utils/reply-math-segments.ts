import { CURRENCY_REGEX, convertTexDelimitersToDollars } from "@/lib/utils/preprocess-latex";

export type ReplyMathSegment =
  | { type: "text"; value: string }
  | { type: "math"; value: string; display: boolean };

function restoreCurrencyPlaceholders(text: string, currencies: string[]): string {
  // Sentinels match preprocessLatex (NUL + CUR + index); must not appear in user text.
  // oxlint-disable-next-line eslint(no-control-regex)
  return text.replace(/\u0000CUR(\d+)\u0000/g, (_, idx) => currencies[Number(idx)] ?? "");
}

function mergeAdjacentText(segments: ReplyMathSegment[]): ReplyMathSegment[] {
  const out: ReplyMathSegment[] = [];
  for (const seg of segments) {
    if (seg.type === "text" && out.length > 0 && out[out.length - 1].type === "text") {
      out[out.length - 1].value += seg.value;
    } else {
      out.push(seg);
    }
  }
  return out;
}

/**
 * Parses reply/selection text into alternating plain and math segments.
 * Aligns with {@link preprocessLatex}: currency is not treated as `$…$` math,
 * and `\(…\)` / `\[…\]` are normalized to `$…$` / `$$…$$` like Streamdown.
 * TipTap / thread extraction already emit `$…$` and `$$…$$` (see extractSelectionTextForAskAI).
 */
export function parseReplyTextIntoMathSegments(raw: string): ReplyMathSegment[] {
  const currencies: string[] = [];
  let masked = raw.replace(CURRENCY_REGEX, (match) => {
    currencies.push(match);
    return `\u0000CUR${currencies.length - 1}\u0000`;
  });
  masked = convertTexDelimitersToDollars(masked);

  const segments: ReplyMathSegment[] = [];
  let i = 0;
  while (i < masked.length) {
    if (masked.startsWith("$$", i)) {
      const end = masked.indexOf("$$", i + 2);
      if (end !== -1) {
        segments.push({ type: "math", value: masked.slice(i + 2, end), display: true });
        i = end + 2;
        continue;
      }
      segments.push({ type: "text", value: "$$" });
      i += 2;
      continue;
    }
    if (masked[i] === "$") {
      const end = masked.indexOf("$", i + 1);
      if (end !== -1) {
        segments.push({ type: "math", value: masked.slice(i + 1, end), display: false });
        i = end + 1;
        continue;
      }
      segments.push({ type: "text", value: masked.slice(i) });
      break;
    }
    const nextDollar = masked.indexOf("$", i);
    const end = nextDollar === -1 ? masked.length : nextDollar;
    segments.push({ type: "text", value: masked.slice(i, end) });
    i = end;
  }

  return mergeAdjacentText(
    segments.map((s) =>
      s.type === "text" ? { ...s, value: restoreCurrencyPlaceholders(s.value, currencies) } : s,
    ),
  );
}
