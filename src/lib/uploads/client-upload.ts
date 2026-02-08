/**
 * Client-side file upload utility that uploads directly to Supabase storage,
 * bypassing the Vercel 4.5MB serverless function body size limit.
 *
 * Flow:
 * 1. Client requests a signed upload URL from /api/upload-url (tiny JSON payload)
 * 2. Client uploads the file directly to Supabase using the signed URL
 * 3. Returns the public URL of the uploaded file
 *
 * Falls back to /api/upload-file for local storage mode.
 */

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

interface UploadResult {
  url: string;
  filename: string;
}

/**
 * Upload a file directly to storage, bypassing the serverless function body limit.
 * Works for both Supabase (direct upload) and local storage (fallback to API route).
 */
export async function uploadFileDirect(file: File): Promise<UploadResult> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File size exceeds ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit`
    );
  }

  // Step 1: Request a signed upload URL from our API (small JSON payload)
  const urlResponse = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

  // Local storage mode: fall back to /api/upload-file
  if (urlData.mode === "local") {
    return uploadViaApiRoute(file);
  }

  // Step 2: Upload file directly to Supabase using the signed URL
  const { signedUrl, token, publicUrl, path } = urlData;

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
      return uploadViaApiRoute(file);
    }
    throw new Error(
      `Direct upload failed: ${uploadResponse.statusText}`
    );
  }

  return {
    url: publicUrl,
    filename: path,
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
  };
}
