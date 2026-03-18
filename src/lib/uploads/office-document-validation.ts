/**
 * Validation for Office documents (Word, Excel, PowerPoint).
 * These are rejected — users can convert to PDF at iLovePDF.
 */

export const CONVERT_URLS = {
  word: "https://www.ilovepdf.com/word_to_pdf",
  excel: "https://www.ilovepdf.com/excel_to_pdf",
  powerpoint: "https://www.ilovepdf.com/powerpoint_to_pdf",
} as const;

export type OfficeDocumentType = keyof typeof CONVERT_URLS;

export const OFFICE_DOCUMENT_ACCEPT = {
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
} as const;

export const OFFICE_DOCUMENT_ACCEPT_STRING = [
  ...[
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
  ],
].join(",");

// Word: .doc, .docx
const WORD_MIMES = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const WORD_EXTS = [".doc", ".docx"];

// Excel: .xls, .xlsx
const EXCEL_MIMES = [
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const EXCEL_EXTS = [".xls", ".xlsx"];

// PowerPoint: .ppt, .pptx
const PPTX_MIMES = [
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
const PPTX_EXTS = [".ppt", ".pptx"];

function checkFile(
  file: File,
  exts: string[],
  mimes: string[]
): boolean {
  const n = file.name.toLowerCase();
  return exts.some((e) => n.endsWith(e)) || mimes.includes(file.type || "");
}

function checkByName(filename: string, exts: string[]): boolean {
  const n = filename.toLowerCase();
  return exts.some((e) => n.endsWith(e));
}

function checkByMime(contentType: string, mimes: string[]): boolean {
  return mimes.includes(contentType);
}

export function isWordFile(file: File): boolean {
  return checkFile(file, WORD_EXTS, WORD_MIMES);
}

export function isExcelFile(file: File): boolean {
  return checkFile(file, EXCEL_EXTS, EXCEL_MIMES);
}

export function isPptxFile(file: File): boolean {
  return checkFile(file, PPTX_EXTS, PPTX_MIMES);
}

export function isOfficeDocument(file: File): boolean {
  return isWordFile(file) || isExcelFile(file) || isPptxFile(file);
}

export function isWordByName(filename: string): boolean {
  return checkByName(filename, WORD_EXTS);
}

export function isExcelByName(filename: string): boolean {
  return checkByName(filename, EXCEL_EXTS);
}

export function isPptxByName(filename: string): boolean {
  return checkByName(filename, PPTX_EXTS);
}

export function isWordByMime(contentType: string): boolean {
  return checkByMime(contentType, WORD_MIMES);
}

export function isExcelByMime(contentType: string): boolean {
  return checkByMime(contentType, EXCEL_MIMES);
}

export function isPptxByMime(contentType: string): boolean {
  return checkByMime(contentType, PPTX_MIMES);
}

export function isOfficeDocumentByName(filename: string): boolean {
  return isWordByName(filename) || isExcelByName(filename) || isPptxByName(filename);
}

export function isOfficeDocumentByMime(contentType: string): boolean {
  return isWordByMime(contentType) || isExcelByMime(contentType) || isPptxByMime(contentType);
}

/** Get convert URL for a file, or null if not an office document */
export function getOfficeDocumentConvertUrl(file: File): string | null {
  if (isWordFile(file)) return CONVERT_URLS.word;
  if (isExcelFile(file)) return CONVERT_URLS.excel;
  if (isPptxFile(file)) return CONVERT_URLS.powerpoint;
  return null;
}

/** Get convert URL from filename/contentType (for API routes) */
export function getOfficeDocumentConvertUrlFromMeta(
  filename: string,
  contentType: string
): string | null {
  if (isWordByName(filename) || isWordByMime(contentType))
    return CONVERT_URLS.word;
  if (isExcelByName(filename) || isExcelByMime(contentType))
    return CONVERT_URLS.excel;
  if (isPptxByName(filename) || isPptxByMime(contentType))
    return CONVERT_URLS.powerpoint;
  return null;
}
