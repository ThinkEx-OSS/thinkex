"use client";

import { useDropzone } from "react-dropzone";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { CgNotes } from "react-icons/cg";
import { useCallback, useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import type { PdfData, ImageData, AudioData } from "@/lib/workspace-state/types";
import { DEFAULT_CARD_DIMENSIONS } from "@/lib/workspace-state/grid-layout-helpers";
import { useReactiveNavigation } from "@/hooks/ui/use-reactive-navigation";
import { uploadFileDirect } from "@/lib/uploads/client-upload";
import { uploadPdfToStorage } from "@/lib/uploads/pdf-upload-with-ocr";
import { filterPasswordProtectedPdfs } from "@/lib/uploads/pdf-validation";
import { OFFICE_DOCUMENT_ACCEPT } from "@/lib/uploads/office-document-validation";
import { emitPasswordProtectedPdf } from "@/components/modals/PasswordProtectedPdfDialog";

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

  const uploadFileToStorage = async (file: File) => uploadFileDirect(file);

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
          oversizedFiles.push(`${file.name} (${(file.size / (1024 * 1024)).toFixed(1)}MB)`);
        } else {
          validFiles.push(file);
          processingFilesRef.current.add(fileKey);
        }
      });

      // Show error for oversized files
      if (oversizedFiles.length > 0) {
        toast.error(
          `The following PDF${oversizedFiles.length > 1 ? 's' : ''} exceed${oversizedFiles.length === 1 ? 's' : ''} the ${MAX_FILE_SIZE_MB}MB limit:\n${oversizedFiles.join('\n')}`
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

      // Reject password-protected PDFs
      const pdfFiles = validFiles.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
      const nonPdfFiles = validFiles.filter(f => f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf'));
      let allowedPdfs = pdfFiles;
      if (pdfFiles.length > 0) {
        const { valid, rejected } = await filterPasswordProtectedPdfs(pdfFiles);
        if (rejected.length > 0) {
          emitPasswordProtectedPdf(rejected);
          rejected.forEach(name => {
            const file = pdfFiles.find(f => f.name === name);
            if (file) processingFilesRef.current.delete(getFileKey(file));
          });
        }
        allowedPdfs = valid;
      }
      const filteredFiles = [...nonPdfFiles, ...allowedPdfs];
      if (filteredFiles.length === 0) {
        return;
      }

      isProcessingRef.current = true;

      // Show loading toast
      const loadingToastId = toast.loading(
        `Uploading ${filteredFiles.length} file${filteredFiles.length > 1 ? 's' : ''}...`
      );

      try {
        // Separate PDFs from other files — PDFs use direct upload + OCR from URL
        const pdfFiles = filteredFiles.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
        const nonPdfFiles = filteredFiles.filter((f) => f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf'));

        // PDFs: upload to storage only (non-blocking), OCR runs in background
        const pdfResults: Array<{
          fileUrl: string;
          filename: string;
          fileSize: number;
          name: string;
          pdfData: Partial<PdfData>;
        }> = [];
        if (pdfFiles.length > 0) {
          const pdfPromises = pdfFiles.map(async (file) => {
            try {
              const { url, filename, fileSize } = await uploadPdfToStorage(file);
              return {
                fileUrl: url,
                filename,
                fileSize,
                name: file.name.replace(/\.pdf$/i, ''),
                pdfData: {
                  fileUrl: url,
                  filename,
                  fileSize,
                  ocrStatus: "processing" as const,
                  ocrPages: [],
                } as Partial<PdfData>,
              };
            } catch (err) {
              const fileKey = getFileKey(file);
              processingFilesRef.current.delete(fileKey);
              console.error('PDF upload failed:', err);
              return null;
            }
          });

          const results = await Promise.all(pdfPromises);
          pdfResults.push(...results.filter((r): r is NonNullable<typeof r> => r !== null));
        }

        // Non-PDFs: upload only
        const nonPdfResults: Array<{
          fileUrl: string;
          filename: string;
          contentType: string;
          displayName: string;
          fileSize: number;
          name: string;
          originalFile: File;
        }> = [];
        if (nonPdfFiles.length > 0) {
          const uploadPromises = nonPdfFiles.map(async (file) => {
            try {
              const result = await uploadFileToStorage(file);
              return {
                fileUrl: result.url,
                filename: result.filename,
                contentType: result.contentType,
                displayName: result.displayName,
                fileSize: file.size,
                name: result.displayName.replace(/\.pdf$/i, ''),
                originalFile: file,
              };
            } catch (error) {
              console.error('Failed to upload file:', error);
              const fileKey = getFileKey(file);
              processingFilesRef.current.delete(fileKey);
              return null;
            }
          });
          const results = await Promise.all(uploadPromises);
          nonPdfResults.push(...results.filter((r): r is NonNullable<typeof r> => r !== null));
        }

        const convertedPdfResults = nonPdfResults
          .filter((r) => r.contentType === 'application/pdf')
          .map((r) => ({
            fileUrl: r.fileUrl,
            filename: r.filename,
            fileSize: r.fileSize,
            name: r.name,
            pdfData: {
              fileUrl: r.fileUrl,
              filename: r.filename,
              fileSize: r.fileSize,
              ocrStatus: "processing" as const,
              ocrPages: [],
            } as Partial<PdfData>,
          }));
        pdfResults.push(...convertedPdfResults);

        const remainingNonPdfResults = nonPdfResults.filter(
          (r) => r.contentType !== 'application/pdf'
        );
        const validResults = [...pdfResults, ...remainingNonPdfResults];
        if (validResults.length > 0) {
          const imageResults: typeof nonPdfResults = [];
          const audioResults: typeof nonPdfResults = [];
          remainingNonPdfResults.forEach((r) => {
            if (r.originalFile.type.startsWith('audio/')) audioResults.push(r);
            else imageResults.push(r);
          });

          // Create PDF cards (OCR runs in background)
          if (pdfResults.length > 0) {
            const pdfCardDefinitions = pdfResults.map((r) => ({
              type: 'pdf' as const,
              name: r.name,
              initialData: r.pdfData,
            }));
            const pdfCreatedIds = operations.createItems(pdfCardDefinitions);
            handleCreatedItems(pdfCreatedIds);
            // Run OCR via workflow; poller dispatches pdf-processing-complete
            pdfResults.forEach((r, i) => {
              const itemId = pdfCreatedIds[i];
              if (!itemId) return;
              fetch("/api/pdf/ocr/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  fileUrl: r.fileUrl,
                  itemId,
                  workspaceId: currentWorkspaceId,
                }),
              })
                .then(async (res) => {
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({ error: res.statusText }));
                    throw new Error((err as { error?: string }).error ?? `OCR start failed: ${res.status}`);
                  }
                  return res.json();
                })
                .then((data) => {
                  if (data.runId && data.itemId) {
                    import("@/lib/pdf/poll-pdf-ocr").then(({ pollPdfOcr }) =>
                      pollPdfOcr(data.runId, data.itemId)
                    );
                  } else {
                    window.dispatchEvent(
                      new CustomEvent("pdf-processing-complete", {
                        detail: {
                          itemId,
                          textContent: "",
                          ocrPages: [],
                          ocrStatus: "failed" as const,
                          ocrError: data.error || "Failed to start OCR",
                        },
                      })
                    );
                  }
                })
                .catch((err) => {
                  window.dispatchEvent(
                    new CustomEvent("pdf-processing-complete", {
                      detail: {
                        itemId,
                        textContent: "",
                        ocrPages: [],
                        ocrStatus: "failed" as const,
                        ocrError: err.message || "Failed to start OCR",
                      },
                    })
                  );
                });
            });
          }

          toast.dismiss(loadingToastId);

          // Create image cards with default dimensions
          if (imageResults.length > 0) {
            const { w, h } = DEFAULT_CARD_DIMENSIONS.image;
            const imageCardDefinitions = imageResults.map((result) => ({
              type: 'image' as const,
              name: result.name,
              initialData: {
                url: result.fileUrl,
                altText: result.name,
              } as Partial<ImageData>,
              initialLayout: { w, h },
            }));

            const imageCreatedIds = operations.createItems(imageCardDefinitions);
            // Use shared hook to handle navigation/selection for images
            handleCreatedItems(imageCreatedIds);
          }

          // Create audio cards and trigger Gemini processing
          if (audioResults.length > 0) {
            const audioCardDefinitions = audioResults.map((result) => {
              const audioData: Partial<AudioData> = {
                fileUrl: result.fileUrl,
                filename: result.filename,
                fileSize: result.fileSize,
                mimeType: result.originalFile.type || 'audio/mpeg',
                processingStatus: 'processing',
              };
              return {
                type: 'audio' as const,
                name: result.name.replace(/\.[^/.]+$/, ''),
                initialData: audioData,
              };
            });

            const audioCreatedIds = operations.createItems(audioCardDefinitions);
            handleCreatedItems(audioCreatedIds);

            // Trigger Gemini processing for each audio file
            audioResults.forEach((result, index) => {
              const itemId = audioCreatedIds[index];
              fetch('/api/audio/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fileUrl: result.fileUrl,
                  filename: result.filename,
                  mimeType: result.originalFile.type || 'audio/mpeg',
                  itemId,
                  workspaceId: currentWorkspaceId,
                }),
              })
                .then(res => res.json())
                .then(data => {
                  if (data.runId && data.itemId) {
                    import('@/lib/audio/poll-audio-processing').then(({ pollAudioProcessing }) =>
                      pollAudioProcessing(data.runId, data.itemId)
                    );
                  } else {
                    window.dispatchEvent(
                      new CustomEvent('audio-processing-complete', {
                        detail: { itemId, error: data.error || 'Processing failed' },
                      })
                    );
                  }
                })
                .catch(err => {
                  window.dispatchEvent(
                    new CustomEvent('audio-processing-complete', {
                      detail: { itemId, error: err.message || 'Processing failed' },
                    })
                  );
                });
            });
          }

          // Show success toast
          const totalCreated = validResults.length;
          toast.success(
            `${totalCreated} card${totalCreated > 1 ? 's' : ''} created successfully`
          );
        }

        // Show error if some files failed to upload
        const failedCount = filteredFiles.length - validResults.length;
        if (failedCount > 0) {
          toast.error(`Failed to upload ${failedCount} file${failedCount > 1 ? 's' : ''}`);
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
    accept: {
      'application/pdf': ['.pdf'],
      ...OFFICE_DOCUMENT_ACCEPT,
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp'],
      'image/heic': ['.heic'],
      'image/heif': ['.heif'],
      'image/avif': ['.avif'],
      'image/tiff': ['.tiff', '.tif'],
      'audio/mpeg': ['.mp3'],
      'audio/wav': ['.wav'],
      'audio/ogg': ['.ogg'],
      'audio/aac': ['.aac'],
      'audio/flac': ['.flac'],
      'audio/aiff': ['.aiff'],
      'audio/webm': ['.webm'],
      'audio/mp4': ['.m4a'],
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
                Create Card
              </h3>
              <p className="text-sm text-muted-foreground">
                Drop PDF, Office, image, or audio files here to create cards
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
