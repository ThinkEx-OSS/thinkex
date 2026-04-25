"use client";

import { memo, useEffect, useState } from "react";
import {
  BracesIcon,
  DownloadIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  ImageOffIcon,
  MusicIcon,
  VideoIcon,
} from "lucide-react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

function MimeTypeIcon({ mimeType }: { mimeType: string }) {
  const className = "size-5 shrink-0 text-muted-foreground";
  if (mimeType.startsWith("image/")) return <ImageIcon className={className} />;
  if (mimeType === "application/pdf") {
    return <FileTextIcon className={className} />;
  }
  if (mimeType === "application/json") {
    return <BracesIcon className={className} />;
  }
  if (mimeType.startsWith("text/")) {
    return <FileTextIcon className={className} />;
  }
  if (mimeType.startsWith("audio/")) return <MusicIcon className={className} />;
  if (mimeType.startsWith("video/")) return <VideoIcon className={className} />;
  return <FileIcon className={className} />;
}

export interface FilePartProps {
  url: string;
  mediaType: string;
  filename?: string;
}

/**
 * Renders a `file` UIMessage part. Images get an inline preview with
 * click-to-zoom; everything else renders as a download chip.
 */
export const FilePart = memo(function FilePart({
  url,
  mediaType,
  filename,
}: FilePartProps) {
  if (mediaType.startsWith("image/")) {
    return (
      <ImageFilePart
        key={url}
        url={url}
        mediaType={mediaType}
        filename={filename}
      />
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download={filename}
      className="my-1 inline-flex max-w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
    >
      <MimeTypeIcon mimeType={mediaType} />
      <span className="min-w-0 flex-1 truncate font-medium">
        {filename || "File"}
      </span>
      <DownloadIcon className="size-4 shrink-0 text-muted-foreground" />
    </a>
  );
});

function ImageFilePart({ url, filename }: FilePartProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="my-1 block w-fit max-w-full cursor-zoom-in overflow-hidden rounded-md"
        aria-label={filename || "Image"}
        title={filename}
      >
        <div
          className={cn(
            "relative flex w-fit max-w-full items-center justify-center",
            !loaded && "min-h-12 min-w-12 bg-muted/30",
            error && "min-h-12 min-w-12 bg-muted/30",
          )}
        >
          {!loaded && !error && (
            <div className="flex items-center justify-center p-3">
              <ImageIcon className="size-5 animate-pulse text-muted-foreground" />
            </div>
          )}
          {error ? (
            <div className="flex items-center justify-center p-3">
              <ImageOffIcon className="size-5 text-muted-foreground" />
            </div>
          ) : (
            <img
              src={url}
              alt={filename || "Image content"}
              className={cn(
                "block h-auto max-h-28 w-auto max-w-[56vw] rounded-md object-contain sm:max-h-32 sm:max-w-52",
                !loaded && "invisible",
              )}
              onLoad={() => setLoaded(true)}
              onError={() => setError(true)}
            />
          )}
        </div>
      </button>
      {typeof document !== "undefined" && open && !error
        ? createPortal(
            <div
              role="button"
              tabIndex={0}
              className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/80 duration-200"
              onClick={() => setOpen(false)}
              onKeyDown={(e) => e.key === "Enter" && setOpen(false)}
              aria-label="Close zoomed image"
            >
              <img
                src={url}
                alt={filename || "Image content"}
                className="fade-in zoom-in-95 max-h-[90vh] max-w-[90vw] animate-in cursor-zoom-out object-contain duration-200"
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
