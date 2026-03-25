"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { uploadFileDirect } from "@/lib/uploads/client-upload";

export const WORKSPACE_FILE_INPUT_ACCEPT =
  "image/*,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif,.avif,.tiff,.tif,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx";

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

      try {
        const results = await Promise.all(
          imageFiles.map(async (file) => {
            const result = await uploadFileDirect(file);
            return {
              url: result.url,
              name: file.name.split(".").slice(0, -1).join(".") || "Image",
            };
          })
        );

        results.forEach(({ url, name }) => onImageCreate(url, name));
        toast.dismiss(toastId);
        toast.success(
          `${imageFiles.length} image${imageFiles.length > 1 ? "s" : ""} uploaded successfully`
        );
      } catch (error) {
        console.error("Image upload failed:", error);
        toast.dismiss(toastId);
        toast.error("Failed to upload image files");
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
