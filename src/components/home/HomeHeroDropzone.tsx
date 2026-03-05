"use client";

import { useDropzone } from "react-dropzone";
import { useHomeAttachments } from "@/contexts/HomeAttachmentsContext";
import { Upload } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface HomeHeroDropzoneProps {
  children: React.ReactNode;
  /** Called when files are dropped — e.g. to show the prompt input */
  onFilesDropped?: () => void;
}

/**
 * Dropzone for the entire home page.
 * Accepts PDF, image, and audio files — same as the Upload button.
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
    accept: {
      "application/pdf": [".pdf"],
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/gif": [".gif"],
      "image/webp": [".webp"],
      "image/heic": [".heic"],
      "image/heif": [".heif"],
      "image/avif": [".avif"],
      "image/tiff": [".tiff", ".tif"],
      "image/svg+xml": [".svg"],
      "audio/mpeg": [".mp3"],
      "audio/wav": [".wav"],
      "audio/ogg": [".ogg"],
      "audio/aac": [".aac"],
      "audio/flac": [".flac"],
      "audio/aiff": [".aiff"],
      "audio/webm": [".webm"],
      "audio/mp4": [".m4a"],
    },
    onDropRejected: (fileRejections) => {
      if (fileRejections.length > 0) {
        const names = fileRejections.map((r) => r.file.name).join(", ");
        toast.error(`Only PDF, image, and audio files are supported. Rejected: ${names}`);
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
                PDF, image, or audio — same as the Upload button
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
