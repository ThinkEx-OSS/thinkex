"use client";

import { useDropzone } from "react-dropzone";
import { useAui } from "@assistant-ui/react";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { Upload } from "lucide-react";
import { useCallback, useState, useRef } from "react";
import { toast } from "sonner";

interface AssistantDropzoneProps {
  children: React.ReactNode;
}

/**
 * Dropzone component specifically for the assistant panel area.
 * Accepts all supported file types and adds them as attachments to the chat composer.
 */
export function AssistantDropzone({ children }: AssistantDropzoneProps) {
  const aui = useAui();
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const [isDragging, setIsDragging] = useState(false);

  // Track files currently being processed to prevent duplicates
  const processingFilesRef = useRef<Set<string>>(new Set());
  const isProcessingRef = useRef(false);

  // Create a unique key for a file to track duplicates
  const getFileKey = (file: File): string => {
    return `${file.name}-${file.size}-${file.lastModified}`;
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!currentWorkspaceId || !aui) return;

      const MAX_FILES = 10;
      const MAX_FILE_SIZE_MB = 50;
      const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

      // Check file count limit
      if (acceptedFiles.length > MAX_FILES) {
        toast.error(`You can only upload up to ${MAX_FILES} files at once. You dropped ${acceptedFiles.length} files.`, {
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
          `The following file${oversizedFiles.length > 1 ? 's' : ''} exceed${oversizedFiles.length === 1 ? 's' : ''} the ${MAX_FILE_SIZE_MB}MB limit:\n${oversizedFiles.join('\n')}`,
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

      try {
        // Add each file to the composer
        const addPromises = validFiles.map(async (file) => {
          try {
            await aui.composer().addAttachment(file);
          } catch (error) {
            console.error("Failed to add attachment:", error);
            // Remove from processing set on error so it can be retried
            const fileKey = getFileKey(file);
            processingFilesRef.current.delete(fileKey);
            throw error;
          }
        });

        // Wait for all files to be added
        await Promise.allSettled(addPromises);

        // Show success message if some files were rejected
        if (validFiles.length < acceptedFiles.length) {
          toast.success(`${validFiles.length} file${validFiles.length > 1 ? 's' : ''} added successfully`, {
            style: { color: '#fff' },
          });
        }
      } finally {
        // Clear processing state after all operations complete
        // Use a small delay to ensure any pending state updates are processed
        setTimeout(() => {
          validFiles.forEach((file) => {
            const fileKey = getFileKey(file);
            processingFilesRef.current.delete(fileKey);
          });
          isProcessingRef.current = false;
        }, 200);
      }
    },
    [aui, currentWorkspaceId]
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
    disabled: !currentWorkspaceId || !aui, // Disable if no workspace is selected or api is not available
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'],
      'video/*': ['.mp4', '.webm', '.avi', '.mov', '.mkv'],
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'text/csv': ['.csv'],
      'application/json': ['.json'],
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
          `The following file${rejectedFileNames.length > 1 ? 's are' : ' is'} not supported:\n${rejectedFileNames.join('\n')}\n\nSupported: Images, Videos, PDFs, Office documents, Text files`,
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
              <Upload className="h-12 w-12 text-primary animate-bounce" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground">
                Add to Chat
              </h3>
              <p className="text-sm text-muted-foreground">
                Drop files here to add them to your message
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
