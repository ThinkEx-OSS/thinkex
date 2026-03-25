"use client";

import { useDropzone } from "react-dropzone";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { CgNotes } from "react-icons/cg";
import { useCallback, useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { DEFAULT_CARD_DIMENSIONS } from "@/lib/workspace-state/grid-layout-helpers";
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
  WORKSPACE_FILE_UPLOAD_ACCEPT,
  WORKSPACE_FILE_UPLOAD_DESCRIPTION,
} from "@/lib/uploads/workspace-upload-config";

interface WorkspaceCanvasDropzoneProps {
  children: React.ReactNode;
}

/**
 * Dropzone component specifically for the workspace canvas area.
 * Accepts supported workspace files and creates corresponding cards when dropped.
 */
export function WorkspaceCanvasDropzone({ children }: WorkspaceCanvasDropzoneProps) {
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const { state: workspaceState } = useWorkspaceState(currentWorkspaceId);
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

      isProcessingRef.current = true;

      // Show loading toast
      const loadingToastId = toast.loading(
        getDocumentUploadLoadingMessage(filteredFiles.length)
      );

      try {
        const { uploads, failedFiles } = await uploadSelectedFiles(filteredFiles);
        if (uploads.length > 0) {
          const itemDefinitions = buildWorkspaceItemDefinitionsFromAssets(uploads, {
            imageLayout: DEFAULT_CARD_DIMENSIONS.image,
          });
          const createdIds = operations.createItems(itemDefinitions, {
            showSuccessToast: false,
          });
          handleCreatedItems(createdIds);

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
          const totalCreated = uploads.length;
          const failedCount = failedFiles.length;
          if (totalCreated > 0 && failedCount === 0) {
            toast.success(getDocumentUploadSuccessMessage(totalCreated));
          } else if (totalCreated > 0) {
            toast.warning(getDocumentUploadPartialMessage(totalCreated, failedCount));
          }
        }

        // Show error if some files failed to upload
        if (filteredFiles.length > 0 && filteredFiles.length === failedFiles.length) {
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
    accept: WORKSPACE_FILE_UPLOAD_ACCEPT,
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
          `Only PDF, Office, image, and audio files can be dropped.\nRejected: ${rejectedFileNames.join(", ")}`
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
                Drop {WORKSPACE_FILE_UPLOAD_DESCRIPTION} here to create cards
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
