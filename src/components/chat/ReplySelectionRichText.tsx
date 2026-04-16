"use client";

import { memo, useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  parseReplyTextIntoMathSegments,
  type ReplyMathSegment,
} from "@/lib/utils/reply-math-segments";

function MathSegment({ value, display }: { value: string; display: boolean }) {
  const html = useMemo(() => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    try {
      return katex.renderToString(trimmed, {
        displayMode: display,
        throwOnError: false,
        strict: "ignore",
      });
    } catch {
      return "";
    }
  }, [value, display]);

  if (!html) return null;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function renderSegments(segments: ReplyMathSegment[]) {
  return segments.map((seg, idx) =>
    seg.type === "text" ? (
      <span key={idx}>{seg.value}</span>
    ) : (
      <MathSegment key={idx} value={seg.value} display={seg.display} />
    ),
  );
}

/**
 * Renders Ask AI reply snippets with KaTeX for `$…$` / `$$…$$` (and `\(\)` / `\[\]` after
 * the same normalization as preprocess-latex). Plain text is unchanged.
 */
export const ReplySelectionRichText = memo(function ReplySelectionRichText({
  text,
}: {
  text: string;
}) {
  const segments = useMemo(() => parseReplyTextIntoMathSegments(text), [text]);
  return <>{renderSegments(segments)}</>;
});
