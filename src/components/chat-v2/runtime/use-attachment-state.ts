"use client";

import { useCallback, useMemo, useState } from "react";
import type { FileUIPart } from "ai";
import { uploadFileDirect } from "@/lib/uploads/client-upload";
import { isOfficeDocument } from "@/lib/uploads/office-document-validation";
import { isPasswordProtectedPdf } from "@/lib/uploads/pdf-validation";
import { emitPasswordProtectedPdf } from "@/components/modals/PasswordProtectedPdfDialog";
import { useAttachmentUploadStore } from "@/lib/stores/attachment-upload-store";
import type { AttachmentData } from "@/components/chat-v2/parts/attachment-tile";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

interface AttachmentStateItem extends AttachmentData {
  uploadedFile?: FileUIPart;
}

function getAttachmentType(file: File): AttachmentData["type"] {
  if (file.type.startsWith("image/")) {
    return "image";
  }

  if (file.type === "application/pdf" || isOfficeDocument(file)) {
    return "document";
  }

  return "file";
}

export function useAttachmentState() {
  const [attachments, setAttachments] = useState<AttachmentStateItem[]>([]);

  const addFile = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `File size exceeds ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit`,
      );
    }

    if (await isPasswordProtectedPdf(file)) {
      emitPasswordProtectedPdf([file.name]);
      throw new Error(
        `"${file.name}" is password-protected. Password-protected PDFs are not supported.`,
      );
    }

    const id = crypto.randomUUID();
    const type = getAttachmentType(file);
    const uploadStore = useAttachmentUploadStore.getState();

    setAttachments((current) => [
      ...current,
      {
        id,
        type,
        name: file.name,
        file,
        content:
          type === "image"
            ? [{ type: "image", image: URL.createObjectURL(file) }]
            : [],
      },
    ]);

    uploadStore.addUploading(id);

    try {
      const uploadResult = await uploadFileDirect(file);

      setAttachments((current) =>
        current.map((attachment) =>
          attachment.id !== id
            ? attachment
            : {
                ...attachment,
                name: uploadResult.displayName,
                content:
                  attachment.type === "image"
                    ? [{ type: "image", image: uploadResult.url }]
                    : attachment.content,
                uploadedFile: {
                  type: "file",
                  url: uploadResult.url,
                  mediaType: uploadResult.contentType,
                  filename: uploadResult.displayName,
                },
              },
        ),
      );
    } catch (error) {
      setAttachments((current) =>
        current.filter((attachment) => attachment.id !== id),
      );
      throw error;
    } finally {
      uploadStore.removeUploading(id);
    }
  }, []);

  const remove = useCallback((id: string) => {
    useAttachmentUploadStore.getState().removeUploading(id);
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }, []);

  const clear = useCallback(() => {
    const uploadStore = useAttachmentUploadStore.getState();
    setAttachments((current) => {
      current.forEach((attachment) => uploadStore.removeUploading(attachment.id));
      return [];
    });
  }, []);

  const files = useMemo(
    () =>
      attachments
        .map((attachment) => attachment.uploadedFile)
        .filter((file): file is FileUIPart => file != null),
    [attachments],
  );

  const uploading = useAttachmentUploadStore((state) =>
    attachments.some((attachment) => state.uploadingIds.has(attachment.id)),
  );

  return {
    attachments,
    addFile,
    remove,
    clear,
    files,
    uploading,
  };
}
