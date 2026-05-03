"use client";

import { useDropzone } from "react-dropzone";
import { useCurrentWorkspaceId } from "@/contexts/WorkspaceContext";
import { useWorkspaceItems } from "@/hooks/workspace/use-workspace-items";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { CgNotes } from "react-icons/cg";
import { useCallback, useState, useRef } from "react";
import { toast } from "sonner";
import { useReactiveNavigation } from "@/hooks/ui/use-reactive-navigation";
import {
  buildWorkspaceItemDefinitionsFromAssets,
} from "@/lib/uploads/uploaded-asset";
import {
  getFileSizeLabel,
  prepareWorkspaceUploadSelection,
  uploadSelectedFiles,
} from "@/lib/uploads/upload-selection";
import { startAssetProcessing } from "@/lib/uploads/start-asset-processing";
import { emitPasswordProtectedPdf } from "@/components/modals/PasswordProtectedPdfDialog";
import {
  getDocumentUploadFailureMessage,
  getDocumentUploadLoadingMessage,
  getDocumentUploadPartialMessage,
  getDocumentUploadSuccessMessage,
} from "@/lib/uploads/upload-feedback";
import {
  WORKSPACE_UPLOAD_ACCEPT,
  WORKSPACE_UPLOAD_DESCRIPTION,
  isTextOrCodeFile,
} from "@/lib/uploads/accepted-file-types";
import { textFileToMarkdown } from "@/lib/uploads/text-file-to-markdown";

interface WorkspaceCanvasDropzoneProps {
  children: React.ReactNode;
}

/**
 * Dropzone component specifically for the workspace canvas area.
 * Accepts supported workspace files and creates corresponding cards when dropped.
 */
export function WorkspaceCanvasDropzone({ children }: WorkspaceCanvasDropzoneProps) {
  const currentWorkspaceId = useCurrentWorkspaceId();
  const workspaceState = useWorkspaceItems();
  const operations = useWorkspaceOperations(currentWorkspaceId, workspaceState);
  const [isDragging, setIsDragging] = useState(false);

  // Use reactive navigation hook for auto-scroll/selection
  const { handleCreatedItems } = useReactiveNavigation(workspaceState);

  // Track files currently being processed to prevent duplicates
  const processingFilesRef = useRef<Set<string>>(new Set());
  const isProcessingRef = useRef(false);

  // Create a unique key for a file to track duplicates
  const getFileKey = (file: File): string => {
    return `${file.name}-${file.size}-${file.lastModified}`;
  };
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!currentWorkspaceId) {
        toast.error("No workspace selected");
        return;
      }

      const MAX_FILE_SIZE_MB = 50;
      const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
      const MAX_COMBINED_BYTES = 100 * 1024 * 1024; // 100MB total

      // Prevent multiple simultaneous drop events
      if (isProcessingRef.current) {
        return;
      }

      // Validate file sizes and filter out files already being processed
      const validFiles: File[] = [];
      const oversizedFiles: string[] = [];
      const duplicateFiles: string[] = [];

      acceptedFiles.forEach((file) => {
        const fileKey = getFileKey(file);

        if (processingFilesRef.current.has(fileKey)) {
          duplicateFiles.push(file.name);
          return;
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
          oversizedFiles.push(getFileSizeLabel(file));
        } else {
          validFiles.push(file);
          processingFilesRef.current.add(fileKey);
        }
      });

      // Show error for oversized files
      if (oversizedFiles.length > 0) {
        toast.error(
          `The following file${oversizedFiles.length > 1 ? 's' : ''} exceed${oversizedFiles.length === 1 ? 's' : ''} the ${MAX_FILE_SIZE_MB}MB limit:\n${oversizedFiles.join('\n')}`
        );
      }

      if (validFiles.length === 0) {
        return;
      }

      // Check combined size limit (100MB total)
      const totalSize = validFiles.reduce((sum, f) => sum + f.size, 0);
      if (totalSize > MAX_COMBINED_BYTES) {
        const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(1);
        toast.error(`Total file size (${totalSizeMB}MB) exceeds the 100MB combined limit`);
        validFiles.forEach(f => processingFilesRef.current.delete(getFileKey(f)));
        return;
      }

      const { acceptedFiles: filteredFiles, protectedPdfNames } =
        await prepareWorkspaceUploadSelection(validFiles);
      if (protectedPdfNames.length > 0) {
        emitPasswordProtectedPdf(protectedPdfNames);
      }
      const excludedFiles = validFiles.filter(
        (file) => !filteredFiles.includes(file)
      );
      excludedFiles.forEach((file) => {
        processingFilesRef.current.delete(getFileKey(file));
      });
      if (filteredFiles.length === 0) {
        return;
      }

      const textFiles = filteredFiles.filter(f => isTextOrCodeFile(f.name));
      const uploadableFiles = filteredFiles.filter(f => !isTextOrCodeFile(f.name));

      isProcessingRef.current = true;

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
          handleCreatedItems(textCreatedIds);
          toast.success(
            `${textCreatedIds.length} document${textCreatedIds.length === 1 ? "" : "s"} created`,
          );
        }
        filteredFiles.forEach((file) => {
          processingFilesRef.current.delete(getFileKey(file));
        });
        isProcessingRef.current = false;
        return;
      }

      const loadingToastId = toast.loading(
        getDocumentUploadLoadingMessage(uploadableFiles.length)
      );

      try {
        const { uploads, failedFiles } = await uploadSelectedFiles(uploadableFiles);
        if (uploads.length > 0) {
          const itemDefinitions = buildWorkspaceItemDefinitionsFromAssets(uploads);
          const createdIds = operations.createItems(itemDefinitions, {
            showSuccessToast: false,
          });
          handleCreatedItems([...textCreatedIds, ...createdIds]);

          toast.dismiss(loadingToastId);

          void startAssetProcessing({
            workspaceId: currentWorkspaceId,
            assets: uploads,
            itemIds: createdIds,
            onOcrError: (error) => {
              console.error("[WORKSPACE_DROPZONE] Failed to start processing:", error);
            },
          });

          // Show success toast
          const totalCreated = uploads.length + textCreatedIds.length;
          const failedCount = failedFiles.length;
          if (totalCreated > 0 && failedCount === 0) {
            toast.success(getDocumentUploadSuccessMessage(totalCreated));
          } else if (totalCreated > 0) {
            toast.warning(getDocumentUploadPartialMessage(totalCreated, failedCount));
          }
        }

        // Show error if some files failed to upload
        if (uploadableFiles.length > 0 && uploadableFiles.length === failedFiles.length) {
          const failedCount = failedFiles.length;
          toast.error(getDocumentUploadFailureMessage(failedCount));
        }
      } finally {
        // Dismiss loading toast if it's still showing (in case of unexpected errors)
        toast.dismiss(loadingToastId);
        // Clear processing state immediately after all operations complete
        filteredFiles.forEach((file) => {
          const fileKey = getFileKey(file);
          processingFilesRef.current.delete(fileKey);
        });
        isProcessingRef.current = false;
      }
    },
    [currentWorkspaceId, operations, handleCreatedItems]
  );

  // Clear processing state when drag ends (user drags away or cancels)
  const handleDragEnd = useCallback(() => {
    // Only clear if we're not currently processing (to avoid clearing active uploads)
    if (!isProcessingRef.current) {
      processingFilesRef.current.clear();
    }
  }, []);

  const { getRootProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true, // Don't trigger on click, only drag and drop
    noKeyboard: true, // Don't trigger on keyboard
    disabled: !currentWorkspaceId, // Disable if no workspace is selected
    accept: WORKSPACE_UPLOAD_ACCEPT,
    onDragEnter: () => setIsDragging(true),
    onDragLeave: () => {
      setIsDragging(false);
      handleDragEnd();
    },
    onDropAccepted: () => {
      setIsDragging(false);
    },
    onDropRejected: (fileRejections) => {
      setIsDragging(false);
      handleDragEnd();

      if (fileRejections.length > 0) {
        const rejectedFileNames = fileRejections.map((r) => r.file.name);
        toast.error(
          `This file type is not supported.\nRejected: ${rejectedFileNames.join(", ")}`
        );
      }
    },
  });

  const showOverlay = isDragActive || isDragging;

  return (
    <div {...getRootProps()} className="relative h-full w-full">
      {children}
      {showOverlay && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm pointer-events-none">
          <div className="text-center space-y-4 p-8 rounded-lg bg-background/95 border-2 border-dashed border-primary shadow-lg">
            <div className="flex justify-center">
              <CgNotes className="h-12 w-12 text-primary animate-bounce" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground">
                Add files
              </h3>
              <p className="text-sm text-muted-foreground">
                Drop {WORKSPACE_UPLOAD_DESCRIPTION} here to create cards
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
