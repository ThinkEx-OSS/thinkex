import type {
  AttachmentAdapter,
  PendingAttachment,
  CompleteAttachment,
} from "@assistant-ui/react";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB to match server limit

/**
 * Upload a file to our own storage via /api/upload-file.
 * Returns the public URL of the uploaded file.
 */
async function uploadFile(file: File): Promise<string> {
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

  const { url } = await response.json();
  return url;
}

/**
 * Custom attachment adapter that uploads files to our own Supabase storage
 * via the existing /api/upload-file endpoint, instead of assistant-ui's cloud storage.
 *
 * Uploads start optimistically in add() so the file is uploading while the user
 * types their message. By the time send() is called, the upload is often already done.
 */
export class SupabaseAttachmentAdapter implements AttachmentAdapter {
  accept =
    "image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,.json";

  // Map of attachment ID → upload promise (started eagerly in add())
  private pendingUploads = new Map<string, Promise<string>>();

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `File size exceeds ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit`
      );
    }

    // Determine attachment type based on file MIME type
    let type: "image" | "document" | "file" = "file";
    if (file.type.startsWith("image/")) {
      type = "image";
    } else if (
      file.type === "application/pdf" ||
      file.type.includes("document") ||
      file.type.includes("spreadsheet") ||
      file.type.includes("presentation")
    ) {
      type = "document";
    }

    const id = crypto.randomUUID();

    // Start upload immediately in background (optimistic)
    this.pendingUploads.set(id, uploadFile(file));

    return {
      id,
      type,
      name: file.name,
      contentType: file.type || "application/octet-stream",
      file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    const file = attachment.file;

    // Await the upload that was started optimistically in add()
    // If it wasn't started (shouldn't happen), start it now as fallback
    let uploadPromise = this.pendingUploads.get(attachment.id);
    if (!uploadPromise) {
      uploadPromise = uploadFile(file);
    }

    const url = await uploadPromise;
    this.pendingUploads.delete(attachment.id);

    return {
      id: attachment.id,
      type: attachment.type,
      name: attachment.name,
      contentType: file.type || "application/octet-stream",
      content: [
        {
          type: "file",
          data: url,
          mimeType: file.type || "application/octet-stream",
        },
      ],
      status: { type: "complete" },
    };
  }

  async remove(attachment: PendingAttachment): Promise<void> {
    // Cancel/cleanup the pending upload if user removes the attachment
    this.pendingUploads.delete(attachment.id);
  }
}
