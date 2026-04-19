"use client";
/* eslint-disable @next/next/no-img-element */

import React, {
  type PropsWithChildren,
  useEffect,
  useState,
  type FC,
} from "react";
import {
  XIcon,
  Link as LinkIcon,
  FileText,
  Loader2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { cn } from "@/lib/utils";

export interface AttachmentData {
  id: string;
  type: string;
  name?: string;
  file?: File;
  content?: Array<{ type: string; text?: string; image?: string }>;
}

export interface AttachmentTileProps {
  attachment: AttachmentData;
  source: "composer" | "message";
  uploading?: boolean;
}

export interface AttachmentTileCardProps extends AttachmentTileProps {
  removable?: boolean;
  onRemove?: () => void;
}

export const useFileSrc = (file: File | undefined) => {
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!file) {
      setSrc(undefined);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setSrc(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return src;
};

function getFaviconUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace("www.", "");
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return "";
  }
}

type UrlLikeAttachment = {
  name?: string;
  file?: { name?: string } | File;
};

function getHttpAttachmentUrl(att: UrlLikeAttachment | undefined): string | undefined {
  const name = att?.name;
  if (!name) return undefined;
  try {
    const url = new URL(name);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return name;
    }
  } catch {
  }
  return undefined;
}

function isUrlAttachment(att: UrlLikeAttachment | undefined): boolean {
  if (!att) return false;
  if (att.file?.name?.endsWith(".url")) {
    return true;
  }
  return getHttpAttachmentUrl(att) != null;
}

function getAttachmentTypeLabel(attachment: AttachmentData): string {
  if (isUrlAttachment(attachment)) {
    return "URL";
  }

  switch (attachment.type) {
    case "image":
      return "Image";
    case "document":
      return "Document";
    case "file":
      return "File";
    default:
      return "File";
  }
}

function getAttachmentName(attachment: AttachmentData): string {
  return attachment.file?.name ?? attachment.name ?? "Attachment";
}

function useAttachmentSrc(attachment: AttachmentData) {
  const fileSrc = useFileSrc(attachment.file);
  const isUrl = isUrlAttachment(attachment);
  const url = getHttpAttachmentUrl(attachment);
  const imageContent = attachment.content?.find(
    (content): content is { type: string; image?: string } => content.type === "image",
  );

  return {
    src: isUrl ? (url ? getFaviconUrl(url) : undefined) : (fileSrc ?? imageContent?.image),
    isUrl,
    url,
  };
}

type AttachmentPreviewProps = {
  src: string;
};

const AttachmentPreview: FC<AttachmentPreviewProps> = ({ src }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  return (
    <img
      src={src}
      alt="Image Preview"
      className={cn(
        "block h-auto max-h-[80vh] w-auto max-w-full object-contain",
        isLoaded
          ? "aui-attachment-preview-image-loaded"
          : "aui-attachment-preview-image-loading invisible",
      )}
      onLoad={() => setIsLoaded(true)}
    />
  );
};

export interface AttachmentDialogProps extends PropsWithChildren {
  attachment: AttachmentData;
}

export const AttachmentDialog: FC<AttachmentDialogProps> = ({
  attachment,
  children,
}) => {
  const { src } = useAttachmentSrc(attachment);

  if (!src) return <>{children}</>;

  return (
    <Dialog>
      <DialogTrigger
        className="aui-attachment-preview-trigger cursor-pointer transition-colors hover:bg-accent/50"
        asChild
      >
        {children}
      </DialogTrigger>
      <DialogContent className="aui-attachment-preview-dialog-content p-2 sm:max-w-3xl [&>button]:rounded-full [&>button]:bg-foreground/60 [&>button]:p-1 [&>button]:opacity-100 [&>button]:ring-0! [&_svg]:text-background [&>button]:hover:[&_svg]:text-destructive">
        <DialogTitle className="aui-sr-only sr-only">
          Image Attachment Preview
        </DialogTitle>
        <div className="aui-attachment-preview relative mx-auto flex max-h-[80dvh] w-full items-center justify-center overflow-hidden bg-background">
          <AttachmentPreview src={src} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AttachmentThumb: FC<{ attachment: AttachmentData }> = ({ attachment }) => {
  const isImage = attachment.type === "image";
  const { src, isUrl } = useAttachmentSrc(attachment);

  if (isUrl && src) {
    return (
      <Avatar className="aui-attachment-tile-avatar h-full w-full rounded-none">
        <AvatarImage
          src={src}
          alt="URL favicon"
          className="aui-attachment-tile-image object-cover"
        />
        <AvatarFallback delayMs={0} className="bg-muted">
          <LinkIcon className="aui-attachment-tile-fallback-icon size-6 text-sidebar-foreground/80" />
        </AvatarFallback>
      </Avatar>
    );
  }

  if (isUrl) {
    return (
      <Avatar className="aui-attachment-tile-avatar h-full w-full rounded-none">
        <AvatarFallback delayMs={0} className="bg-muted">
          <LinkIcon className="aui-attachment-tile-fallback-icon size-6 text-sidebar-foreground/80" />
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <Avatar className="aui-attachment-tile-avatar h-full w-full rounded-none">
      <AvatarImage
        src={src}
        alt="Attachment preview"
        className="aui-attachment-tile-image object-cover"
      />
      <AvatarFallback delayMs={isImage ? 200 : 0}>
        <FileText className="aui-attachment-tile-fallback-icon size-6 text-sidebar-foreground/80" />
      </AvatarFallback>
    </Avatar>
  );
};

export const AttachmentTile: FC<AttachmentTileProps> = ({
  attachment,
  source,
  uploading = false,
}) => {
  const isComposer = source === "composer";
  const isImage = attachment.type === "image";
  const isUrl = isUrlAttachment(attachment);
  const typeLabel = getAttachmentTypeLabel(attachment);
  const name = getAttachmentName(attachment);

  return (
    <Tooltip>
      <div
        className={cn(
          "aui-attachment-root relative flex flex-col items-center gap-1.5 max-w-[100px]",
          isImage &&
            isComposer &&
            "aui-attachment-root-composer only:[&>#attachment-tile]:size-24",
        )}
      >
        <div className="relative">
          {isComposer && uploading ? (
            <div
              className={cn(
                "aui-attachment-tile size-14 overflow-hidden rounded-[14px] border border-foreground/20 bg-muted/60 flex items-center justify-center",
                isImage && "size-24",
              )}
            >
              <Loader2 className="size-6 shrink-0 text-muted-foreground animate-spin" />
            </div>
          ) : (
            <AttachmentDialog attachment={attachment}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "aui-attachment-tile size-14 cursor-pointer overflow-hidden rounded-[14px] border bg-muted transition-opacity hover:opacity-75",
                    isComposer &&
                      "aui-attachment-tile-composer border-foreground/20",
                  )}
                  role="button"
                  id="attachment-tile"
                  aria-label={`${typeLabel} attachment`}
                >
                  <AttachmentThumb attachment={attachment} />
                </div>
              </TooltipTrigger>
            </AttachmentDialog>
          )}
        </div>
        {!(isComposer && uploading) && (
          <div className="text-[11px] text-muted-foreground w-full truncate text-center px-1 leading-tight">
            {name}
          </div>
        )}
      </div>
      <TooltipContent side="top">{isUrl ? name : name}</TooltipContent>
    </Tooltip>
  );
};

export const AttachmentTileCard: FC<AttachmentTileCardProps> = ({
  attachment,
  source,
  uploading = false,
  removable = false,
  onRemove,
}) => {
  const isUrl = isUrlAttachment(attachment);

  return (
    <div className="relative">
      <AttachmentTile
        attachment={attachment}
        source={source}
        uploading={uploading}
      />
      {removable && !uploading ? (
        <TooltipIconButton
          tooltip={isUrl ? "Remove URL" : "Remove file"}
          className="aui-attachment-tile-remove absolute top-1.5 right-1.5 size-3.5 rounded-full bg-white text-muted-foreground opacity-100 shadow-sm hover:bg-white! [&_svg]:text-black hover:[&_svg]:text-destructive"
          side="top"
          onClick={(event) => {
            event.stopPropagation();
            onRemove?.();
          }}
        >
          <XIcon className="aui-attachment-remove-icon size-3 dark:stroke-[2.5px]" />
        </TooltipIconButton>
      ) : null}
    </div>
  );
};

export { isUrlAttachment, getHttpAttachmentUrl, getFaviconUrl };
