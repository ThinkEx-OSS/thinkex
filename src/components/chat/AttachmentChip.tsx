"use client";

import { FileText, Loader2, Link as LinkIcon, XIcon, AlertTriangle } from "lucide-react";
import { useEffect, useState, type FC } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TooltipIconButton } from "@/components/chat/tooltip-icon-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { ComposerAttachment } from "./composer-context";

const useObjectUrl = (file: File | undefined) => {
  const [src, setSrc] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!file) {
      setSrc(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return src;
};

function getFaviconUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname.replace(/^www\./, "")}&sz=64`;
  } catch {
    return undefined;
  }
}

interface AttachmentChipProps {
  attachment: ComposerAttachment;
  onRemove?: (id: string) => void;
  /** When true, hide the remove icon (used in user-message rendering). */
  readOnly?: boolean;
}

export const AttachmentChip: FC<AttachmentChipProps> = ({
  attachment,
  onRemove,
  readOnly,
}) => {
  const isImage = attachment.kind === "image";
  const objectUrl = useObjectUrl(isImage ? attachment.file : undefined);
  const previewSrc = objectUrl ?? attachment.url;

  return (
    <Tooltip>
      <div
        className={cn(
          "relative flex flex-col items-center gap-1.5 max-w-[100px]",
          isImage && "only:[&>#attachment-tile]:size-24",
        )}
      >
        <div className="relative">
          {attachment.status === "uploading" ? (
            <div
              className={cn(
                "size-14 overflow-hidden rounded-[14px] border border-foreground/20 bg-muted/60 flex items-center justify-center",
                isImage && "size-24",
              )}
            >
              <Loader2 className="size-6 shrink-0 text-muted-foreground animate-spin" />
            </div>
          ) : attachment.status === "error" ? (
            <div
              className={cn(
                "size-14 overflow-hidden rounded-[14px] border border-destructive/40 bg-destructive/5 flex items-center justify-center",
                isImage && "size-24",
              )}
            >
              <AlertTriangle className="size-6 shrink-0 text-destructive" />
            </div>
          ) : (
            <Dialog>
              <DialogTrigger
                className="cursor-pointer transition-colors hover:bg-accent/50"
                asChild
              >
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "size-14 cursor-pointer overflow-hidden rounded-[14px] border bg-muted transition-opacity hover:opacity-75 border-foreground/20",
                    )}
                    role="button"
                    id="attachment-tile"
                    aria-label={`${attachment.kind} attachment`}
                  >
                    <AttachmentThumb
                      kind={attachment.kind}
                      previewSrc={previewSrc}
                      url={attachment.url}
                    />
                  </div>
                </TooltipTrigger>
              </DialogTrigger>
              {isImage && previewSrc ? (
                <DialogContent className="p-2 sm:max-w-3xl [&>button]:rounded-full [&>button]:bg-foreground/60 [&>button]:p-1 [&>button]:opacity-100 [&>button]:ring-0! [&_svg]:text-background [&>button]:hover:[&_svg]:text-destructive">
                  <DialogTitle className="sr-only">Image preview</DialogTitle>
                  <div className="relative mx-auto flex max-h-[80dvh] w-full items-center justify-center overflow-hidden bg-background">
                    <img
                      src={previewSrc}
                      alt={attachment.name}
                      className="block h-auto max-h-[80vh] w-auto max-w-full object-contain"
                    />
                  </div>
                </DialogContent>
              ) : null}
            </Dialog>
          )}
          {!readOnly && onRemove && attachment.status !== "uploading" && (
            <TooltipIconButton
              tooltip="Remove file"
              className="absolute top-1.5 right-1.5 size-3.5 rounded-full bg-white text-muted-foreground opacity-100 shadow-sm hover:bg-white! [&_svg]:text-black hover:[&_svg]:text-destructive"
              side="top"
              onClick={() => onRemove(attachment.id)}
            >
              <XIcon className="size-3 dark:stroke-[2.5px]" />
            </TooltipIconButton>
          )}
        </div>
        {attachment.status !== "uploading" && (
          <div className="text-[11px] text-muted-foreground w-full truncate text-center px-1 leading-tight">
            {attachment.name}
          </div>
        )}
      </div>
      <TooltipContent side="top">{attachment.name}</TooltipContent>
    </Tooltip>
  );
};

const AttachmentThumb: FC<{
  kind: ComposerAttachment["kind"];
  previewSrc?: string;
  url?: string;
}> = ({ kind, previewSrc, url }) => {
  // Render favicons for items that look like a URL (legacy `.url` artifacts).
  if (url && url.endsWith(".url")) {
    const fav = getFaviconUrl(url);
    return (
      <Avatar className="h-full w-full rounded-none">
        {fav ? <AvatarImage src={fav} alt="URL favicon" className="object-cover" /> : null}
        <AvatarFallback delayMs={0} className="bg-muted">
          <LinkIcon className="size-6 text-sidebar-foreground/80" />
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <Avatar className="h-full w-full rounded-none">
      {previewSrc ? (
        <AvatarImage
          src={previewSrc}
          alt="Attachment preview"
          className="object-cover"
        />
      ) : null}
      <AvatarFallback delayMs={kind === "image" ? 200 : 0}>
        <FileText className="size-6 text-sidebar-foreground/80" />
      </AvatarFallback>
    </Avatar>
  );
};
