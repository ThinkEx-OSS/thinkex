export function extractDocumentPreview(markdown: string): string {
  if (!markdown.trim()) {
    return "";
  }

  return markdown
    .replace(/```(?:[\w-]+\n)?([\s\S]*?)```/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "• ")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/[|]/g, " ")
    .replace(/\*\*|__|\*|_|~~/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim();
}
