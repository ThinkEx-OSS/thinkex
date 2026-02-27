"use client";

import { ImageIcon, Music, Link as LinkIcon, X, CheckCircle2, AlertCircle } from "lucide-react";
import { CgNotes } from "react-icons/cg";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { isYouTubeUrl } from "@/contexts/HomeAttachmentsContext";
import type { FileItem } from "@/contexts/HomeAttachmentsContext";

function getFileIcon(file: File) {
  if (file.type.startsWith("image/")) return ImageIcon;
  if (file.type.startsWith("audio/")) return Music;
  return CgNotes;
}

function truncate(str: string, maxLen: number) {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

function getLinkDisplay(url: string) {
  try {
    const u = new URL(url);
    if (isYouTubeUrl(url)) {
      const videoId =
        u.searchParams.get("v") ??
        (u.hostname === "youtu.be" ? u.pathname.slice(1).split("/")[0]?.trim() || null : null);
      return `YouTube: ${videoId || "video"}`;
    }
    return u.hostname;
  } catch {
    return truncate(url, 30);
  }
}

interface HomeAttachmentCardsProps {
  fileItems: FileItem[];
  links: string[];
  onRemoveFile: (index: number) => void;
  onRemoveLink: (index: number) => void;
}

export function HomeAttachmentCards({
  fileItems,
  links,
  onRemoveFile,
  onRemoveLink,
}: HomeAttachmentCardsProps) {
  const hasAny = fileItems.length > 0 || links.length > 0;
  if (!hasAny) return null;

  return (
    <div className="flex flex-wrap gap-2 pb-2">
      {/* File cards - per-file skeleton when uploading */}
      {fileItems.map((item, i) => {
        const Icon = getFileIcon(item.file);
        const isUploading = item.status === "uploading";
        const isError = item.status === "error";
        return (
          <div
            key={item.id}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-1.5",
              "min-w-0 max-w-[200px]",
              isError ? "border-destructive/50 bg-destructive/5" : "bg-sidebar/50"
            )}
          >
            {isUploading ? (
              <>
                <Skeleton className="size-5 shrink-0 rounded" />
                <Skeleton className="h-4 flex-1 min-w-[60px]" />
              </>
            ) : (
              <>
                {item.status === "ready" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                ) : isError ? (
                  <AlertCircle className="size-4 shrink-0 text-destructive" />
                ) : (
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate text-sm" title={item.file.name}>
                  {truncate(item.file.name, 24)}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFile(i);
                  }}
                  className="ml-1 shrink-0 rounded p-0.5 hover:bg-muted"
                  aria-label="Remove file"
                >
                  <X className="size-3.5" />
                </button>
              </>
            )}
          </div>
        );
      })}
      {/* Link cards - always show (no upload) */}
      {links.map((url, i) => (
        <div
          key={`link-${i}-${url}`}
          className={cn(
            "flex items-center gap-2 rounded-xl border bg-sidebar/50 px-3 py-1.5",
            "min-w-0 max-w-[200px]"
          )}
        >
          <LinkIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm" title={url}>
            {truncate(getLinkDisplay(url), 24)}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveLink(i);
            }}
            className="ml-1 shrink-0 rounded p-0.5 hover:bg-muted"
            aria-label="Remove link"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
