import {
  OFFICE_DOCUMENT_ACCEPT,
  OFFICE_DOCUMENT_ACCEPT_STRING,
  isOfficeDocument,
} from "@/lib/uploads/office-document-validation";

export const HOME_FILE_UPLOAD_ACCEPT = {
  "application/pdf": [".pdf"],
  ...OFFICE_DOCUMENT_ACCEPT,
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
  "image/avif": [".avif"],
  "image/tiff": [".tiff", ".tif"],
  "image/svg+xml": [".svg"],
} as const;

export const HOME_FILE_UPLOAD_ACCEPT_STRING = [
  "application/pdf",
  OFFICE_DOCUMENT_ACCEPT_STRING,
  "image/*",
].join(",");

export const HOME_FILE_UPLOAD_REJECT_MESSAGE =
  "Only documents and image files are supported.";

export const HOME_FILE_UPLOAD_DESCRIPTION = "Documents and image files";

export function isStudyDocumentFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf") ||
    isOfficeDocument(file)
  );
}
