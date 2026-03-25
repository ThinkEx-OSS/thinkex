import {
  OFFICE_DOCUMENT_ACCEPT,
  OFFICE_DOCUMENT_ACCEPT_STRING,
} from "@/lib/uploads/office-document-validation";

export const WORKSPACE_FILE_UPLOAD_ACCEPT = {
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
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/ogg": [".ogg"],
  "audio/aac": [".aac"],
  "audio/flac": [".flac"],
  "audio/aiff": [".aiff"],
  "audio/webm": [".webm"],
  "audio/mp4": [".m4a"],
} as const;

export const WORKSPACE_FILE_UPLOAD_ACCEPT_STRING = [
  "application/pdf",
  OFFICE_DOCUMENT_ACCEPT_STRING,
  "image/*",
  "audio/*",
]
  .filter(Boolean)
  .join(",");

export const WORKSPACE_FILE_UPLOAD_DESCRIPTION = "documents, images, or audio";
