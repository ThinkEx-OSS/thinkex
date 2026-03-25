"use client";

import { useDropzone } from "react-dropzone";
import { useHomeAttachments } from "@/contexts/HomeAttachmentsContext";
import { Upload } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  HOME_FILE_UPLOAD_ACCEPT,
  HOME_FILE_UPLOAD_DESCRIPTION,
  HOME_FILE_UPLOAD_REJECT_MESSAGE,
} from "@/lib/uploads/home-upload-config";

interface HomeHeroDropzoneProps {
  children: React.ReactNode;
  /** Called when files are dropped — e.g. to show the prompt input */
  onFilesDropped?: () => void;
}

/**
 * Dropzone for the entire home page.
 * Accepts documents (PDF & Office), images, and audio — same as the Upload button.
 * Works even when the prompt input is collapsed.
 */
export function HomeHeroDropzone({ children, onFilesDropped }: HomeHeroDropzoneProps) {
  const { addFiles } = useHomeAttachments();

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      try {
        await addFiles(acceptedFiles);
        onFilesDropped?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to add files");
      }
    },
    [addFiles, onFilesDropped]
  );

  const { getRootProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    accept: HOME_FILE_UPLOAD_ACCEPT,
    onDropRejected: (fileRejections) => {
      if (fileRejections.length > 0) {
        const names = fileRejections.map((r) => r.file.name).join(", ");
        toast.error(`${HOME_FILE_UPLOAD_REJECT_MESSAGE} Rejected: ${names}`);
      }
    },
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative h-full min-h-0 w-full",
        isDragActive && "cursor-copy"
      )}
    >
      {children}
      {isDragActive && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm pointer-events-none rounded-2xl">
          <div className="text-center space-y-4 p-8 rounded-lg bg-background/95 border-2 border-dashed border-primary shadow-lg">
            <div className="flex justify-center">
              <Upload className="h-12 w-12 text-primary animate-bounce" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground">Drop files here</h3>
              <p className="text-sm text-muted-foreground">
                {HOME_FILE_UPLOAD_DESCRIPTION} only
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
