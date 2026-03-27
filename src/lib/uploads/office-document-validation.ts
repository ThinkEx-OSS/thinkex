/**
 * Validation for Office documents (Word, Excel, PowerPoint).
 * These are accepted and converted to PDF for workspace viewing.
 */

const OFFICE_DOCUMENT_DEFINITIONS = {
  word: {
    convertUrl: "https://www.ilovepdf.com/word_to_pdf",
    mimeMap: {
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
  },
  excel: {
    convertUrl: "https://www.ilovepdf.com/excel_to_pdf",
    mimeMap: {
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
  },
  powerpoint: {
    convertUrl: "https://www.ilovepdf.com/powerpoint_to_pdf",
    mimeMap: {
      "application/vnd.ms-powerpoint": [".ppt"],
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
    },
  },
} as const;

type OfficeMimeMap = Record<string, readonly string[]>;

function getMimeMapMimes(mimeMap: OfficeMimeMap): string[] {
  return Object.keys(mimeMap);
}

function getMimeMapExtensions(mimeMap: OfficeMimeMap): string[] {
  return Object.values(mimeMap).flatMap((extensions) => [...extensions]);
}

export const CONVERT_URLS = {
  word: OFFICE_DOCUMENT_DEFINITIONS.word.convertUrl,
  excel: OFFICE_DOCUMENT_DEFINITIONS.excel.convertUrl,
  powerpoint: OFFICE_DOCUMENT_DEFINITIONS.powerpoint.convertUrl,
} as const;

export type OfficeDocumentType = keyof typeof CONVERT_URLS;

export const OFFICE_DOCUMENT_ACCEPT = Object.assign(
  {},
  ...Object.values(OFFICE_DOCUMENT_DEFINITIONS).map(({ mimeMap }) => mimeMap)
) as Record<string, readonly string[]>;

const OFFICE_MIME_BY_EXTENSION = Object.fromEntries(
  Object.values(OFFICE_DOCUMENT_DEFINITIONS).flatMap(({ mimeMap }) =>
    Object.entries(mimeMap).flatMap(([mime, extensions]) =>
      [...extensions].map((extension) => [extension, mime] as const)
    )
  )
) as Record<string, string>;

export const OFFICE_DOCUMENT_ACCEPT_STRING = Object.values(
  OFFICE_DOCUMENT_ACCEPT
)
  .flatMap((extensions) => [...extensions])
  .join(",");

// Word: .doc, .docx
const WORD_MIMES = getMimeMapMimes(OFFICE_DOCUMENT_DEFINITIONS.word.mimeMap);
const WORD_EXTS = getMimeMapExtensions(OFFICE_DOCUMENT_DEFINITIONS.word.mimeMap);

// Excel: .xls, .xlsx
const EXCEL_MIMES = getMimeMapMimes(OFFICE_DOCUMENT_DEFINITIONS.excel.mimeMap);
const EXCEL_EXTS = getMimeMapExtensions(OFFICE_DOCUMENT_DEFINITIONS.excel.mimeMap);

// PowerPoint: .ppt, .pptx
const PPTX_MIMES = getMimeMapMimes(OFFICE_DOCUMENT_DEFINITIONS.powerpoint.mimeMap);
const PPTX_EXTS = getMimeMapExtensions(OFFICE_DOCUMENT_DEFINITIONS.powerpoint.mimeMap);

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

export function getCanonicalOfficeMimeType(filename: string): string | null {
  const lowerName = filename.toLowerCase();
  const matchedExtension = Object.keys(OFFICE_MIME_BY_EXTENSION).find((extension) =>
    lowerName.endsWith(extension)
  );

  return matchedExtension ? OFFICE_MIME_BY_EXTENSION[matchedExtension] : null;
}

export function getPreferredUploadContentType(
  filename: string,
  contentType: string
): string {
  return getCanonicalOfficeMimeType(filename) || contentType || "application/octet-stream";
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
