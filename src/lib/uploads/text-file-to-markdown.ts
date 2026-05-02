import Papa from "papaparse";
import { getCodeLanguage } from "@/lib/uploads/accepted-file-types";

const MARKDOWN_EXTENSIONS = new Set([".md", ".rmd"]);
const PLAIN_TEXT_EXTENSIONS = new Set([".txt", ".log", ".rst"]);
const CSV_EXTENSIONS = new Set([".csv", ".tsv"]);

export async function textFileToMarkdown(file: File): Promise<string | null> {
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  const content = await file.text();

  if (MARKDOWN_EXTENSIONS.has(ext)) return content;

  if (PLAIN_TEXT_EXTENSIONS.has(ext)) return content;

  if (CSV_EXTENSIONS.has(ext)) {
    return csvToMarkdownTable(content, ext === ".tsv" ? "\t" : ",");
  }

  const lang = getCodeLanguage(file.name);
  if (lang !== null) {
    return "```" + lang + "\n" + content + "\n```";
  }

  return null;
}

function csvToMarkdownTable(content: string, delimiter: string): string {
  const result = Papa.parse(content.trim(), {
    delimiter,
    skipEmptyLines: true,
  });

  const rows = result.data as string[][];
  if (rows.length === 0) return content;

  const headers = rows[0];
  const dataRows = rows.slice(1);

  if (headers.length === 0) return content;

  const escapeCell = (cell: string) =>
    (cell ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim();

  const headerLine = "| " + headers.map(escapeCell).join(" | ") + " |";
  const separatorLine = "| " + headers.map(() => "---").join(" | ") + " |";

  const bodyLines = dataRows.map((row) => {
    const paddedRow = headers.map((_, i) => escapeCell(row[i] ?? ""));
    return "| " + paddedRow.join(" | ") + " |";
  });

  return [headerLine, separatorLine, ...bodyLines].join("\n");
}
