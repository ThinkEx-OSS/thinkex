/**
 * Builds reply text from a DOM selection, preferring KaTeX LaTeX from
 * `<annotation encoding="application/x-tex">` so quoted math is usable for the LLM
 * instead of a mix of Unicode + layout glyphs from `.katex-html`.
 */
export function extractSelectionTextForReply(selection: Selection): string {
  const raw = selection.toString().trim();
  if (!selection.rangeCount) return raw;

  try {
    const range = selection.getRangeAt(0);
    const tmp = document.createElement("div");
    tmp.appendChild(range.cloneContents());

    tmp.querySelectorAll(".katex").forEach((el) => {
      const ann = el.querySelector(
        '.katex-mathml annotation[encoding="application/x-tex"]',
      );
      const tex = ann?.textContent?.trim();
      if (!tex) return;

      const display = el.classList.contains("katex-display");
      const wrapped = display ? `$$${tex}$$` : `$${tex}$`;
      el.replaceWith(document.createTextNode(wrapped));
    });

    let out = tmp.innerText;
    out = out.replace(/\u00a0/g, " ");
    out = out.trim();
    return out || raw;
  } catch {
    return raw;
  }
}
