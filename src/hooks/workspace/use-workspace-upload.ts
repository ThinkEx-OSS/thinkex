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
import { isTextOrCodeFile } from "@/lib/uploads/accepted-file-types";
import { textFileToMarkdown } from "@/lib/uploads/text-file-to-markdown";

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
        toast.error("Workspace isn't ready yet \u2014 try again in a moment.");
        return;
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
        await prepareWorkspaceUploadSelection(candidates, {
          maxFileSizeBytes: enforceSizeLimit
            ? MAX_FILE_SIZE_BYTES
            : Number.POSITIVE_INFINITY,
        });
      if (protectedPdfNames.length > 0) emitPasswordProtectedPdf(protectedPdfNames);
      if (acceptedFiles.length === 0) return;

      const textFiles = acceptedFiles.filter(f => isTextOrCodeFile(f.name));
      const uploadableFiles = acceptedFiles.filter(f => !isTextOrCodeFile(f.name));

      const textCreatedIds: string[] = [];
      for (const file of textFiles) {
        const markdown = await textFileToMarkdown(file);
        if (markdown !== null) {
          const name = file.name.replace(/\.[^/.]+$/, "");
          const ids = operations.createItems([{
            type: "document",
            name,
            initialData: { markdown },
          }], { showSuccessToast: false });
          textCreatedIds.push(...ids);
        }
      }

      if (uploadableFiles.length === 0) {
        if (textCreatedIds.length > 0) {
          onItemsCreated?.(textCreatedIds);
          toast.success(
            `${textCreatedIds.length} document${textCreatedIds.length === 1 ? "" : "s"} created`,
          );
        }
        return;
      }

      const toastId = toast.loading(
        getDocumentUploadLoadingMessage(uploadableFiles.length),
      );
      const { uploads, failedFiles } = await uploadSelectedFiles(uploadableFiles);
      toast.dismiss(toastId);

      if (uploads.length === 0) {
        if (failedFiles.length > 0) {
          toast.error(getDocumentUploadFailureMessage(failedFiles.length));
        }
        if (textCreatedIds.length > 0) {
          onItemsCreated?.(textCreatedIds);
        }
        return;
      }

      const createdIds = operations.createItems(
        buildWorkspaceItemDefinitionsFromAssets(uploads, {
          imageLayout: DEFAULT_CARD_DIMENSIONS.image,
        }),
        { showSuccessToast: false },
      );
      onItemsCreated?.([...textCreatedIds, ...createdIds]);

      void startAssetProcessing({
        workspaceId: currentWorkspaceId,
        assets: uploads,
        itemIds: createdIds,
        onOcrError: (e) =>
          console.error("[WORKSPACE_PROCESSING] Failed to start processing:", e),
      });

      const totalCreated = uploads.length + textCreatedIds.length;
      if (failedFiles.length === 0) {
        toast.success(getDocumentUploadSuccessMessage(totalCreated));
      } else {
        toast.warning(
          getDocumentUploadPartialMessage(totalCreated, failedFiles.length),
        );
      }
    },
    [currentWorkspaceId, operations, onItemsCreated, enforceSizeLimit],
  );
}
