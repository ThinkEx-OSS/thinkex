"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { uploadFileDirect } from "@/lib/uploads/client-upload";

export const WORKSPACE_FILE_INPUT_ACCEPT =
  "image/*,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif,.avif,.tiff,.tif,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx";
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

interface UseWorkspaceFilePickerOptions {
  onImageCreate: (url: string, name: string) => void;
  onDocumentUpload?: (files: File[]) => Promise<void>;
}

export function useWorkspaceFilePicker({
  onImageCreate,
  onDocumentUpload,
}: UseWorkspaceFilePickerOptions) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    const documentFiles = files.filter((file) => !file.type.startsWith("image/"));

    if (imageFiles.length > 0) {
      const toastId = toast.loading(
        `Uploading ${imageFiles.length} image${imageFiles.length > 1 ? "s" : ""}...`
      );

      const oversizedFiles = imageFiles.filter((file) => file.size > MAX_FILE_SIZE_BYTES);
      const uploadableImageFiles = imageFiles.filter((file) => file.size <= MAX_FILE_SIZE_BYTES);

      const results = await Promise.allSettled(
        uploadableImageFiles.map(async (file) => {
          const result = await uploadFileDirect(file);
          return {
            url: result.url,
            name: file.name.split(".").slice(0, -1).join(".") || "Image",
          };
        })
      );

      let uploadedCount = 0;
      const failedUploads: string[] = [];

      results.forEach((result, index) => {
        const file = uploadableImageFiles[index];
        if (result.status === "fulfilled") {
          uploadedCount += 1;
          onImageCreate(result.value.url, result.value.name);
          return;
        }

        failedUploads.push(file.name);
        console.error(`Image upload failed for "${file.name}":`, result.reason);
      });

      toast.dismiss(toastId);

      const skippedCount = oversizedFiles.length;
      if (uploadedCount > 0 && failedUploads.length === 0 && skippedCount === 0) {
        toast.success(
          `${uploadedCount} image${uploadedCount > 1 ? "s" : ""} uploaded successfully`
        );
      } else {
        const parts: string[] = [];
        if (uploadedCount > 0) {
          parts.push(`${uploadedCount} uploaded`);
        }
        if (skippedCount > 0) {
          parts.push(`${skippedCount} skipped for exceeding ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`);
          console.error("Skipped oversized image uploads:", oversizedFiles.map((file) => file.name));
        }
        if (failedUploads.length > 0) {
          parts.push(`${failedUploads.length} failed`);
        }

        toast[uploadedCount > 0 ? "warning" : "error"](
          parts.length > 0 ? `Image upload completed: ${parts.join(", ")}` : "Failed to upload image files"
        );
      }
    }

    if (documentFiles.length > 0) {
      if (!onDocumentUpload) {
        toast.error("Document upload not available");
        return;
      }

      try {
        await onDocumentUpload(documentFiles);
      } catch (error) {
        console.error("Document upload failed:", error);
        toast.error("Failed to upload document files");
      }
    }
  }, [onDocumentUpload, onImageCreate]);

  const handleFileInputChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    await uploadFiles(files);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [uploadFiles]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return {
    fileInputRef,
    inputProps: {
      type: "file" as const,
      multiple: true,
      className: "sr-only",
      onChange: handleFileInputChange,
      accept: WORKSPACE_FILE_INPUT_ACCEPT,
    },
    openFilePicker,
    uploadFiles,
  };
}
