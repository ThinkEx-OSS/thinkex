/**
 * Client-side file upload utility that uploads directly to storage when
 * available and falls back to the API route in local-file mode.
 */

import { convertHeicToJpegIfNeeded } from "./convert-heic";
import {
  getPreferredUploadContentType,
  isOfficeDocument,
} from "./office-document-validation";

const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200MB

export interface UploadResult {
  url: string;
  filename: string;
  contentType: string;
  displayName: string;
}

export interface UploadFileDirectOptions {
  /** Enable timing and step logs for debugging (e.g. PDF upload flow) */
  log?: boolean;
}

function getConvertedPdfName(filename: string): string {
  return filename.replace(/\.[^/.]+$/, "") + ".pdf";
}

async function convertOfficeUpload(
  filename: string,
  url: string,
  originalFilename: string
): Promise<UploadResult> {
  const response = await fetch("/api/office-conversion/convert-to-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_path: filename,
      file_url: url,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      (typeof data.error === "string" && data.error) ||
        `Conversion failed: ${response.statusText}`
    );
  }

  if (typeof data.pdf_url !== "string" || data.pdf_url.length === 0) {
    throw new Error("No PDF URL returned from conversion");
  }

  const convertedName = getConvertedPdfName(originalFilename);

  return {
    url: data.pdf_url,
    filename:
      typeof data.pdf_path === "string" && data.pdf_path.length > 0
        ? data.pdf_path
        : convertedName,
    contentType: "application/pdf",
    displayName: convertedName,
  };
}

/**
 * Upload a file directly to storage when the current backend supports signed
 * URLs. In local-file mode the API responds with `mode=local` and the client
 * falls back to /api/upload-file.
 */
export async function uploadFileDirect(
  file: File,
  options?: UploadFileDirectOptions
): Promise<UploadResult> {
  const log = options?.log ?? false;
  const t0 = log ? performance.now() : 0;

  // Convert HEIC/HEIF to JPEG for browser compatibility (Safari supports HEIC; Chrome/Firefox do not)
  file = await convertHeicToJpegIfNeeded(file);

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File size exceeds ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit`
    );
  }

  const isOfficeUpload = isOfficeDocument(file);
  const uploadContentType = getPreferredUploadContentType(
    file.name,
    file.type || "application/octet-stream"
  );

  // Step 1: Request a signed upload URL from our API (small JSON payload)
  const urlResponse = await fetch("/api/upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename: file.name,
      contentType: uploadContentType,
    }),
  });

  if (!urlResponse.ok) {
    const errorData = await urlResponse.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Failed to get upload URL: ${urlResponse.statusText}`
    );
  }

  const urlData = await urlResponse.json();
  if (log) {
    console.info(
      `[PDF_UPLOAD] Get signed URL: ${(performance.now() - t0).toFixed(0)}ms`
    );
  }

  if (urlData.mode === "local") {
    const result = await uploadViaApiRoute(file);
    if (log) {
      const total = performance.now() - t0;
      console.info(`[PDF_UPLOAD] Local upload fallback: ${total.toFixed(0)}ms`);
    }

    if (isOfficeUpload) {
      return convertOfficeUpload(result.filename, result.url, file.name);
    }

    return result;
  }

  // Step 2: Upload file directly to Supabase using the signed URL
  const { signedUrl, publicUrl, path } = urlData;
  const tPut = log ? performance.now() : 0;

  const uploadResponse = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": uploadContentType,
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    // If direct upload fails, try the API route as fallback (for small files)
    if (file.size <= 4 * 1024 * 1024) {
      console.warn("Direct upload failed, falling back to API route for small file");
      const result = await uploadViaApiRoute(file);
      if (isOfficeUpload) {
        return convertOfficeUpload(result.filename, result.url, file.name);
      }
      return result;
    }
    throw new Error(
      `Direct upload failed: ${uploadResponse.statusText}`
    );
  }

  if (log) {
    const t = performance.now() - tPut;
    const total = performance.now() - t0;
    console.info(
      `[PDF_UPLOAD] Direct upload to storage: ${t.toFixed(0)}ms | total upload: ${total.toFixed(0)}ms`
    );
  }

  if (isOfficeUpload) {
    return convertOfficeUpload(path, publicUrl, file.name);
  }

  return {
    url: publicUrl,
    filename: path,
    contentType: uploadContentType,
    displayName: file.name,
  };
}

/**
 * Fallback: upload via the /api/upload-file API route.
 * Only works for files under 4.5MB (Vercel limit).
 */
async function uploadViaApiRoute(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/upload-file", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Upload failed: ${response.statusText}`
    );
  }

  const data = await response.json();
  return {
    url: data.url,
    filename: data.filename,
    contentType: getPreferredUploadContentType(
      file.name,
      file.type || "application/octet-stream"
    ),
    displayName: file.name,
  };
}
