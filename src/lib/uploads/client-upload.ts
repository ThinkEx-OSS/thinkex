/**
 * Client-side file upload utility that uploads directly to Supabase storage,
 * bypassing the Vercel 4.5MB serverless function body size limit.
 *
 * Flow:
 * 1. HEIC/HEIF images are converted to JPEG for browser compatibility
 * 2. Client requests a signed upload URL from /api/upload-url (tiny JSON payload)
 * 3. Client uploads the file directly to Supabase using the signed URL
 * 4. Returns the public URL of the uploaded file
 *
 * Falls back to /api/upload-file for local storage mode.
 */

import { convertHeicToJpegIfNeeded } from "./convert-heic";
import { isOfficeDocument } from "./office-document-validation";

const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200MB

interface UploadResult {
  url: string;
  filename: string;
  contentType: string;
  displayName: string;
  originalUrl?: string;
  originalFilename?: string;
  wasConverted?: boolean;
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

  return {
    url: data.pdf_url,
    filename:
      typeof data.pdf_path === "string" && data.pdf_path.length > 0
        ? data.pdf_path
        : getConvertedPdfName(originalFilename),
    contentType: "application/pdf",
    displayName: getConvertedPdfName(originalFilename),
    originalUrl: url,
    originalFilename,
    wasConverted: true,
  };
}

/**
 * Upload a file directly to storage, bypassing the serverless function body limit.
 * Works for both Supabase (direct upload) and local storage (fallback to API route).
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

  const shouldConvertOffice = isOfficeDocument(file);

  // Step 1: Request a signed upload URL from our API (small JSON payload)
  const urlResponse = await fetch("/api/upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || "application/octet-stream",
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

  // Local storage mode: fall back to /api/upload-file
  if (urlData.mode === "local") {
    const result = await uploadViaApiRoute(file);
    if (log) {
      const t = performance.now() - t0;
      console.info(`[PDF_UPLOAD] Local fallback upload: ${t.toFixed(0)}ms`);
    }

    if (shouldConvertOffice) {
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
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    // If direct upload fails, try the API route as fallback (for small files)
    if (file.size <= 4 * 1024 * 1024) {
      console.warn("Direct upload failed, falling back to API route for small file");
      const result = await uploadViaApiRoute(file);
      if (shouldConvertOffice) {
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

  if (shouldConvertOffice) {
    return convertOfficeUpload(path, publicUrl, file.name);
  }

  return {
    url: publicUrl,
    filename: path,
    contentType: file.type || "application/octet-stream",
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
    contentType: file.type || "application/octet-stream",
    displayName: file.name,
  };
}
