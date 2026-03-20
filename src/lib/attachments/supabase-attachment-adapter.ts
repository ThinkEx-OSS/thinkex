import type {
  AttachmentAdapter,
  PendingAttachment,
  CompleteAttachment,
} from "@assistant-ui/react";
import { uploadFileDirect } from "@/lib/uploads/client-upload";
import { isOfficeDocument } from "@/lib/uploads/office-document-validation";
import { isPasswordProtectedPdf } from "@/lib/uploads/pdf-validation";
import { emitPasswordProtectedPdf } from "@/components/modals/PasswordProtectedPdfDialog";
import { useAttachmentUploadStore } from "@/lib/stores/attachment-upload-store";

const getUploadStore = () => useAttachmentUploadStore.getState();

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB to match server limit

/**
 * Custom attachment adapter that uploads files to our own Supabase storage
 * via the existing /api/upload-file endpoint, instead of assistant-ui's cloud storage.
 *
 * Uploads start optimistically in add() so the file is uploading while the user
 * types their message. By the time send() is called, the upload is often already done.
 */
export class SupabaseAttachmentAdapter implements AttachmentAdapter {
  accept =
    "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json,.mp3,.wav,.ogg,.aac,.flac,.aiff,.webm,.m4a";

  // Map of attachment ID → upload promise (started eagerly in add())
  private pendingUploads = new Map<
    string,
    Promise<Awaited<ReturnType<typeof uploadFileDirect>>>
  >();

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `File size exceeds ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit`
      );
    }

    // Reject password-protected PDFs
    if (await isPasswordProtectedPdf(file)) {
      emitPasswordProtectedPdf([file.name]);
      throw new Error(
        `"${file.name}" is password-protected. Password-protected PDFs are not supported.`
      );
    }

    // Determine attachment type based on file MIME type
    let type: "image" | "document" | "file" = "file";
    if (file.type.startsWith("image/")) {
      type = "image";
    } else if (file.type === "application/pdf" || isOfficeDocument(file)) {
      type = "document";
    }

    const id = crypto.randomUUID();

    // Start upload immediately in background (optimistic)
    getUploadStore().addUploading(id);
    const uploadPromise = uploadFileDirect(file)
      .finally(() => {
        getUploadStore().removeUploading(id);
      });
    this.pendingUploads.set(id, uploadPromise);

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
      uploadPromise = uploadFileDirect(file);
    }

    const uploadResult = await uploadPromise;
    this.pendingUploads.delete(attachment.id);

    return {
      id: attachment.id,
      type: attachment.type,
      name: uploadResult.displayName,
      contentType: uploadResult.contentType,
      content: [
        {
          type: "file",
          data: uploadResult.url,
          mimeType: uploadResult.contentType,
        },
      ],
      status: { type: "complete" },
    };
  }

  async remove(attachment: PendingAttachment): Promise<void> {
    // Cancel/cleanup the pending upload if user removes the attachment
    getUploadStore().removeUploading(attachment.id);
    this.pendingUploads.delete(attachment.id);
  }
}
