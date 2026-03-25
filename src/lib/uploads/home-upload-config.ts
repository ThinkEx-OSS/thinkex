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
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/ogg": [".ogg"],
  "audio/aac": [".aac"],
  "audio/flac": [".flac"],
  "audio/aiff": [".aiff"],
  "audio/webm": [".webm"],
  "audio/mp4": [".m4a"],
} as const;

export const HOME_FILE_UPLOAD_ACCEPT_STRING = [
  "application/pdf",
  OFFICE_DOCUMENT_ACCEPT_STRING,
  "image/*",
  "audio/*",
]
  .filter(Boolean)
  .join(",");

export const HOME_FILE_UPLOAD_REJECT_MESSAGE =
  "Documents, images, and audio files are supported.";

export const HOME_FILE_UPLOAD_DESCRIPTION = "Documents, images, or audio";

export function isStudyDocumentFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf") ||
    isOfficeDocument(file)
  );
}
