"use client";

import { memo, useState } from "react";
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
import { useEffect } from "react";

import { cn } from "@/lib/utils";

function getMimeTypeIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType === "application/pdf") return FileTextIcon;
  if (mimeType === "application/json") return BracesIcon;
  if (mimeType.startsWith("text/")) return FileTextIcon;
  if (mimeType.startsWith("audio/")) return MusicIcon;
  if (mimeType.startsWith("video/")) return VideoIcon;
  return FileIcon;
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
    return <ImageFilePart url={url} mediaType={mediaType} filename={filename} />;
  }
  const Icon = getMimeTypeIcon(mediaType);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download={filename}
      className="my-1 inline-flex max-w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
    >
      <Icon className="size-5 shrink-0 text-muted-foreground" />
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="relative max-w-96 overflow-hidden rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="block w-full cursor-zoom-in"
          aria-label={filename || "Image"}
        >
          <div className="relative min-h-32">
            {!loaded && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                <ImageIcon className="size-8 animate-pulse text-muted-foreground" />
              </div>
            )}
            {error ? (
              <div className="flex min-h-32 items-center justify-center bg-muted/50 p-4">
                <ImageOffIcon className="size-8 text-muted-foreground" />
              </div>
            ) : (
              <img
                src={url}
                alt={filename || "Image content"}
                className={cn(
                  "block h-auto w-full object-contain",
                  !loaded && "invisible",
                )}
                onLoad={() => setLoaded(true)}
                onError={() => setError(true)}
              />
            )}
          </div>
        </button>
        {filename ? (
          <span className="block truncate px-2 py-1.5 text-muted-foreground text-xs">
            {filename}
          </span>
        ) : null}
      </div>
      {mounted && open && !error
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
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
