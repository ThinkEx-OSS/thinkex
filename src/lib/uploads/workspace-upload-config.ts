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
} as const;

export const WORKSPACE_FILE_UPLOAD_ACCEPT_STRING = [
  "application/pdf",
  OFFICE_DOCUMENT_ACCEPT_STRING,
  "image/*",
]
  .filter(Boolean)
  .join(",");

export const WORKSPACE_FILE_UPLOAD_DESCRIPTION = "documents or images";
