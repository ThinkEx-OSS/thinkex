"use client";

import { useDropzone } from "react-dropzone";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { FileText } from "lucide-react";
import { useCallback, useState, useRef } from "react";
import { toast } from "sonner";
import type { PdfData } from "@/lib/workspace-state/types";

interface WorkspaceCanvasDropzoneProps {
  children: React.ReactNode;
}

/**
 * Dropzone component specifically for the workspace canvas area.
 * Only accepts PDFs and creates PDF cards in the workspace when dropped.
 */
export function WorkspaceCanvasDropzone({ children }: WorkspaceCanvasDropzoneProps) {
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const { state: workspaceState } = useWorkspaceState(currentWorkspaceId);
  const operations = useWorkspaceOperations(currentWorkspaceId, workspaceState);
  const [isDragging, setIsDragging] = useState(false);

  // Track files currently being processed to prevent duplicates
  const processingFilesRef = useRef<Set<string>>(new Set());
  const isProcessingRef = useRef(false);

  // Create a unique key for a file to track duplicates
  const getFileKey = (file: File): string => {
    return `${file.name}-${file.size}-${file.lastModified}`;
  };

  const uploadFileToStorage = async (file: File): Promise<{ url: string; filename: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/upload-file', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to upload file');
    }

    const data = await response.json();
    return { url: data.url, filename: data.filename };
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!currentWorkspaceId) {
        toast.error("No workspace selected", {
          style: { color: '#fff' },
        });
        return;
      }

      const MAX_FILES = 5;
      const MAX_FILE_SIZE_MB = 10;
      const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

      // Check file count limit
      if (acceptedFiles.length > MAX_FILES) {
        toast.error(`You can only upload up to ${MAX_FILES} PDFs at once. You dropped ${acceptedFiles.length} files.`, {
          style: { color: '#fff' },
          duration: 5000,
        });
        return;
      }

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
          oversizedFiles.push(`${file.name} (${(file.size / (1024 * 1024)).toFixed(1)}MB)`);
        } else {
          validFiles.push(file);
          processingFilesRef.current.add(fileKey);
        }
      });

      // Show error for oversized files
      if (oversizedFiles.length > 0) {
        toast.error(
          `The following PDF${oversizedFiles.length > 1 ? 's' : ''} exceed${oversizedFiles.length === 1 ? 's' : ''} the ${MAX_FILE_SIZE_MB}MB limit:\n${oversizedFiles.join('\n')}`,
          {
            style: { color: '#fff' },
            duration: 5000,
          }
        );
      }

      if (validFiles.length === 0) {
        return;
      }

      isProcessingRef.current = true;

      // Show loading toast
      const loadingToastId = toast.loading(
        `Uploading ${validFiles.length} PDF${validFiles.length > 1 ? 's' : ''}...`,
        {
          style: { color: '#fff' },
        }
      );

      try {
        // Upload all files in parallel
        const uploadPromises = validFiles.map(async (file) => {
          try {
            const { url, filename } = await uploadFileToStorage(file);
            return {
              fileUrl: url,
              filename: file.name,
              fileSize: file.size,
              name: file.name.replace(/\.pdf$/i, ''), // Remove .pdf extension for card name
            };
          } catch (error) {
            console.error("Failed to upload file:", error);
            // Remove from processing set on error so it can be retried
            const fileKey = getFileKey(file);
            processingFilesRef.current.delete(fileKey);
            return null;
          }
        });

        const uploadResults = await Promise.all(uploadPromises);

        // Filter out any null results (files that couldn't be processed)
        const validResults = uploadResults.filter((result): result is NonNullable<typeof result> => result !== null);

        // Dismiss loading toast
        toast.dismiss(loadingToastId);

        if (validResults.length > 0) {
          // Collect all PDF card data and create in a single batch event
          const pdfCardDefinitions = validResults.map((result) => {
            const pdfData: Partial<PdfData> = {
              fileUrl: result.fileUrl,
              filename: result.filename,
              fileSize: result.fileSize,
            };

            return {
              type: 'pdf' as const,
              name: result.name,
              initialData: pdfData,
            };
          });

          // Create all PDF cards atomically in a single event
          operations.createItems(pdfCardDefinitions);

          // Show success toast
          toast.success(
            `${validResults.length} PDF card${validResults.length > 1 ? 's' : ''} created successfully`,
            {
              style: { color: '#fff' },
            }
          );
        }

        // Show error if some files failed to upload
        const failedCount = validFiles.length - validResults.length;
        if (failedCount > 0) {
          toast.error(`Failed to upload ${failedCount} PDF${failedCount > 1 ? 's' : ''}`, {
            style: { color: '#fff' },
            duration: 5000,
          });
        }
      } finally {
        // Dismiss loading toast if it's still showing (in case of unexpected errors)
        toast.dismiss(loadingToastId);
        // Clear processing state immediately after all operations complete
        validFiles.forEach((file) => {
          const fileKey = getFileKey(file);
          processingFilesRef.current.delete(fileKey);
        });
        isProcessingRef.current = false;
      }
    },
    [currentWorkspaceId, operations]
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
    accept: {
      'application/pdf': ['.pdf'], // Only accept PDFs
    },
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

      // Show error for rejected files
      if (fileRejections.length > 0) {
        const rejectedFileNames = fileRejections.map(rejection => rejection.file.name);
        toast.error(
          `Only PDF files can be dropped into the workspace.\nRejected: ${rejectedFileNames.join(', ')}`,
          {
            style: { color: '#fff' },
            duration: 5000,
          }
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
              <FileText className="h-12 w-12 text-primary animate-bounce" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground">
                Create PDF Card
              </h3>
              <p className="text-sm text-muted-foreground">
                Drop PDF files here to create cards in your workspace
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
