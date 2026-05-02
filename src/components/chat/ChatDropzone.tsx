"use client";

import { Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";

import { useOptionalComposer } from "@/components/chat/composer-context";
import { useCurrentWorkspaceId } from "@/contexts/WorkspaceContext";
import { CHAT_UPLOAD_ACCEPT } from "@/lib/uploads/accepted-file-types";

interface ChatDropzoneProps {
  children: React.ReactNode;
}

/**
 * Wraps the chat panel with a drag/drop overlay that funnels files into the
 * active {@link useComposer} attachment list. Replaces the legacy
 * AssistantDropzone which was wired to the AUI runtime.
 */
export function ChatDropzone({ children }: ChatDropzoneProps) {
  const composer = useOptionalComposer();
  const currentWorkspaceId = useCurrentWorkspaceId();
  const [isDragging, setIsDragging] = useState(false);

  const isProcessingRef = useRef(false);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!currentWorkspaceId || !composer) return;

      const MAX_FILES = 10;
      if (acceptedFiles.length > MAX_FILES) {
        toast.error(
          `You can only upload up to ${MAX_FILES} files at once. You dropped ${acceptedFiles.length} files.`,
        );
        return;
      }

      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      try {
        await composer.addAttachments(acceptedFiles);
      } finally {
        setTimeout(() => {
          isProcessingRef.current = false;
        }, 200);
      }
    },
    [composer, currentWorkspaceId],
  );

  const { getRootProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    disabled: !currentWorkspaceId || !composer,
    accept: CHAT_UPLOAD_ACCEPT,
    onDragEnter: () => setIsDragging(true),
    onDragLeave: () => setIsDragging(false),
    onDropAccepted: () => setIsDragging(false),
    onDropRejected: (fileRejections) => {
      setIsDragging(false);
      if (fileRejections.length === 0) return;
      const names = fileRejections.map((r) => r.file.name);
      toast.error(
        `The following file${names.length > 1 ? "s are" : " is"} not supported:\n${names.join("\n")}\n\nThis file type is not supported.`,
      );
    },
  });

  const showOverlay = isDragActive || isDragging;

  return (
    <div
      {...getRootProps()}
      className="relative flex min-h-0 w-full flex-1 flex-col"
    >
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
