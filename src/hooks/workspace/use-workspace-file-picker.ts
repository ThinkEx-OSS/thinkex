"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { uploadFileDirect } from "@/lib/uploads/client-upload";
import { WORKSPACE_UPLOAD_ACCEPT_STRING } from "@/lib/uploads/accepted-file-types";

export const WORKSPACE_FILE_INPUT_ACCEPT =
  WORKSPACE_UPLOAD_ACCEPT_STRING;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

interface UseWorkspaceFilePickerOptions {
  onImageUpload?: (images: Array<{ url: string; name: string }>) => void;
  /** Handles every selected file, including PDFs, Office docs, images, and audio. */
  onFilesSelected?: (files: File[]) => Promise<void>;
}

export function useWorkspaceFilePicker({
  onImageUpload,
  onFilesSelected,
}: UseWorkspaceFilePickerOptions) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    if (onFilesSelected) {
      try {
        await onFilesSelected(files);
      } catch (error) {
        console.error("File upload failed:", error);
        toast.error("Failed to add files");
      }
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
          return;
        }

        failedUploads.push(file.name);
        console.error(`Image upload failed for "${file.name}":`, result.reason);
      });

      toast.dismiss(toastId);

      const uploadedImages = results
        .filter(
          (
            result
          ): result is PromiseFulfilledResult<{ url: string; name: string }> =>
            result.status === "fulfilled"
        )
        .map((result) => result.value);

      if (uploadedImages.length > 0 && onImageUpload) {
        onImageUpload(uploadedImages);
      }

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
      toast.error("This file type is not supported in this context.");
    }
  }, [onFilesSelected, onImageUpload]);

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
