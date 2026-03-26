type OcrPageLike = {
  markdown?: string | null;
};

export function getOcrPagesTextContent(
  ocrPages?: OcrPageLike[] | null
): string {
  if (!ocrPages?.length) return "";

  return ocrPages
    .map((page) => page.markdown ?? "")
    .filter(Boolean)
    .join("\n\n");
}
