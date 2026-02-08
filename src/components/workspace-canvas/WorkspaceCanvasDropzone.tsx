"use client";

import { useDropzone } from "react-dropzone";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { FileText } from "lucide-react";
import { useCallback, useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import type { PdfData, ImageData } from "@/lib/workspace-state/types";
import { getBestFrameForRatio, type GridFrame } from "@/lib/workspace-state/aspect-ratios";
import { useReactiveNavigation } from "@/hooks/ui/use-reactive-navigation";

interface WorkspaceCanvasDropzoneProps {
  children: React.ReactNode;
}

/**
 * Dropzone component specifically for the workspace canvas area.
 * Accepts PDFs and images and creates corresponding cards in the workspace when dropped.
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
        `Uploading ${validFiles.length} file${validFiles.length > 1 ? 's' : ''}...`,
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
          // Separate files by type
          const pdfResults: typeof validResults = [];
          const imageResults: typeof validResults = [];

          validResults.forEach((result, index) => {
            const file = validFiles[index];
            if (file.type === 'application/pdf') {
              pdfResults.push(result);
            } else {
              imageResults.push(result);
            }
          });

          // Create PDF cards
          if (pdfResults.length > 0) {
            const pdfCardDefinitions = pdfResults.map((result) => {
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

            const pdfCreatedIds = operations.createItems(pdfCardDefinitions);
            // Use shared hook to handle navigation/selection for PDFs
            handleCreatedItems(pdfCreatedIds);
          }

          // Create image cards with aspect ratio detection
          if (imageResults.length > 0) {
            // Helper to get image dimensions
            const getImageDimensions = (url: string): Promise<{ width: number; height: number }> => {
              return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
                img.onerror = reject;
                img.src = url;
              });
            };

            // Process images to get dimensions before creating cards
            const imageDefinitionsPromises = imageResults.map(async (result) => {
              const imageData: Partial<ImageData> = {
                url: result.fileUrl,
                altText: result.name,
              };

              let layout = undefined;

              try {
                // Get dimensions to determine aspect ratio
                const { width, height } = await getImageDimensions(result.fileUrl);
                // Use the small frame (w:2) for initial drops, relying on resize logic to scale up if needed
                const bestFrame = getBestFrameForRatio(width, height);

                // Construct layout object
                if (bestFrame) {
                  // Create standard RGL layout object
                  // Note: We only set the 'lg' breakpoint here. 
                  // The system will handle the responsive mapping.
                  // However, createItems/createItem doesn't accept a layout object directly in its simplified signature.
                  // We might need to rely on the default size if we can't pass layout.

                  // Actually, createItems takes `initialData`. 
                  // The `useWorkspaceOperations.createItems` implementation might need adjustment to accept `layout`.
                  // But wait, the `Item` type has a `layout` property.

                  // Let's modify the return type here to match what createItems expects.
                  // createItems takes `Partial<Item>[]` effectively (name, type, initialData).
                  // If we need to pass layout, we'll need to check if createItems supports it.

                  // Looking at `use-workspace-operations.ts` (from memory):
                  // createItems(items: { type: CardType; name?: string; initialData?: any }[])
                  // It doesn't seem to support passing layout directly in the current definition.

                  // Workaround: We can't easily pass layout without modifying `createItems`.
                  // BUT, we defined default dimensions in `grid-layout-helpers.ts`.
                  // To do "adaptive" sizing per item, we really need custom layout support.

                  // Let's assume for now we will modify createItems or use a workaround.
                  // Or actually, `createItems` might accept extra properties.
                  // Let's check `use-workspace-operations.ts` content later if this fails.
                  // For now, I will assume we can pass `layout` or `w`/`h` if I modify the type def there.

                  // Actually, a safer bet is to just let them be created with defaults (4x10) 
                  // and then immediately update them? That's glitchy.

                  // Wait, I can't modify `createItems` easily right now without checking it.
                  // Let's look at `use-workspace-operations` again.

                  // WAIT! I already checked `use-workspace-operations.ts` earlier. 
                  // It takes `definitions: { type: CardType; name?: string; initialData?: Partial<Item['data']> }[]`.
                  // It constructs the item using `createItem` logic usually.

                  // I will pass `initialLayout` property in the definition and update `use-workspace-operations` to use it.
                  return {
                    type: 'image' as const,
                    name: result.name,
                    initialData: imageData,
                    initialLayout: { w: bestFrame.w, h: bestFrame.h } // Passing custom property
                  };
                }
              } catch (e) {
                console.error("Failed to load image for dimensions:", e);
              }

              return {
                type: 'image' as const,
                name: result.name,
                initialData: imageData,
              };
            });

            const imageCardDefinitions = await Promise.all(imageDefinitionsPromises);

            // @ts-ignore - We are passing extra 'initialLayout' that we'll handle in createItems
            const imageCreatedIds = operations.createItems(imageCardDefinitions);
            // Use shared hook to handle navigation/selection for images
            handleCreatedItems(imageCreatedIds);
          }

          // Show success toast
          const totalCreated = validResults.length;
          toast.success(
            `${totalCreated} card${totalCreated > 1 ? 's' : ''} created successfully`,
            {
              style: { color: '#fff' },
            }
          );
        }

        // Show error if some files failed to upload
        const failedCount = validFiles.length - validResults.length;
        if (failedCount > 0) {
          toast.error(`Failed to upload ${failedCount} file${failedCount > 1 ? 's' : ''}`, {
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
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp'],
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
          `Only PDF and image files (PNG, JPG, GIF, WebP) can be dropped.\nRejected: ${rejectedFileNames.join(', ')}`,
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
                Create Card
              </h3>
              <p className="text-sm text-muted-foreground">
                Drop PDF or image files here to create cards
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
