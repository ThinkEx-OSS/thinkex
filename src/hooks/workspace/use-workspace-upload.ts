"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import type { WorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { DEFAULT_CARD_DIMENSIONS } from "@/lib/workspace-state/grid-layout-helpers";
import { buildWorkspaceItemDefinitionsFromAssets } from "@/lib/uploads/uploaded-asset";
import {
  getFileSizeLabel,
  prepareWorkspaceUploadSelection,
  uploadSelectedFiles,
} from "@/lib/uploads/upload-selection";
import { startAssetProcessing } from "@/lib/uploads/start-asset-processing";
import {
  getDocumentUploadFailureMessage,
  getDocumentUploadLoadingMessage,
  getDocumentUploadPartialMessage,
  getDocumentUploadSuccessMessage,
} from "@/lib/uploads/upload-feedback";
import { emitPasswordProtectedPdf } from "@/components/modals/PasswordProtectedPdfDialog";

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

interface UseWorkspaceUploadParams {
  currentWorkspaceId: string | null;
  operations: WorkspaceOperations | null | undefined;
  onItemsCreated?: (createdIds: string[]) => void;
  /** Reject files >50MB with a toast. Header path doesn't enforce; canvas does. */
  enforceSizeLimit?: boolean;
}

/** Single PDF/asset upload pipeline. Replaces two near-identical handlers. */
export function useWorkspaceUpload({
  currentWorkspaceId,
  operations,
  onItemsCreated,
  enforceSizeLimit = true,
}: UseWorkspaceUploadParams) {
  return useCallback(
    async (files: File[]) => {
      if (!operations || !currentWorkspaceId) {
        throw new Error("Workspace not available");
      }

      let candidates = files;
      if (enforceSizeLimit) {
        const oversized = files.filter((f) => f.size > MAX_FILE_SIZE_BYTES);
        candidates = files.filter((f) => f.size <= MAX_FILE_SIZE_BYTES);
        if (oversized.length > 0) {
          toast.error(
            `${oversized.length} file${oversized.length === 1 ? "" : "s"} exceed the ${MAX_FILE_SIZE_MB}MB limit:\n${oversized.map(getFileSizeLabel).join("\n")}`,
          );
        }
        if (candidates.length === 0) return;
      }

      const { acceptedFiles, protectedPdfNames } =
        await prepareWorkspaceUploadSelection(candidates);
      if (protectedPdfNames.length > 0) emitPasswordProtectedPdf(protectedPdfNames);
      if (acceptedFiles.length === 0) return;

      const toastId = toast.loading(
        getDocumentUploadLoadingMessage(acceptedFiles.length),
      );
      const { uploads, failedFiles } = await uploadSelectedFiles(acceptedFiles);
      toast.dismiss(toastId);

      if (uploads.length === 0) {
        if (failedFiles.length > 0) {
          toast.error(getDocumentUploadFailureMessage(failedFiles.length));
        }
        return;
      }

      const createdIds = operations.createItems(
        buildWorkspaceItemDefinitionsFromAssets(uploads, {
          imageLayout: DEFAULT_CARD_DIMENSIONS.image,
        }),
        { showSuccessToast: false },
      );
      onItemsCreated?.(createdIds);

      void startAssetProcessing({
        workspaceId: currentWorkspaceId,
        assets: uploads,
        itemIds: createdIds,
        onOcrError: (e) =>
          console.error("[WORKSPACE_PROCESSING] Failed to start processing:", e),
      });

      if (failedFiles.length === 0) {
        toast.success(getDocumentUploadSuccessMessage(uploads.length));
      } else {
        toast.warning(
          getDocumentUploadPartialMessage(uploads.length, failedFiles.length),
        );
      }
    },
    [currentWorkspaceId, operations, onItemsCreated, enforceSizeLimit],
  );
}
