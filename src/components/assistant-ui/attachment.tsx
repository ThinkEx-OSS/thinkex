"use client";

import React, { PropsWithChildren, useEffect, useState, useRef, type FC } from "react";
import { XIcon, FileText, Link as LinkIcon, Upload, Link2, SearchIcon, Plus, Code as CodeIcon, GalleryHorizontalEnd } from "lucide-react";
import { LuPaperclip } from "react-icons/lu";
import { toast } from "sonner";
import {
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useAui,
} from "@assistant-ui/react";
import { useAuiState } from "@assistant-ui/react";
import { useShallow } from "zustand/shallow";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuShortcut,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createUrlFile } from "@/lib/attachments/url-utils";
import { useUIStore } from "@/lib/stores/ui-store";
import { FaCheck } from "react-icons/fa";
import { focusComposerInput } from "@/lib/utils/composer-utils";

const useFileSrc = (file: File | undefined) => {
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

/**
 * Get favicon URL for a given URL
 */
function getFaviconUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    // Use Google's favicon service for reliable favicon fetching
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return '';
  }
}

const useAttachmentSrc = () => {
  const attachmentState = useAuiState(
    useShallow(({ attachment }): { file?: File; src?: string; isUrl?: boolean; url?: string } => {
      const att = attachment as {
        type?: string;
        name?: string;
        file?: File & { name: string };
        content?: Array<{ type: string; text?: string; image?: string }>;
      } | undefined;
      if (!att) return { file: undefined, src: undefined, isUrl: false, url: undefined };
      // Check if this is a URL attachment by checking:
      // 1. Content with [URL_CONTEXT:...] marker (after send)
      // 2. File name ending with .url (before send)
      // 3. Attachment name being a valid URL (before send)

      // Check content first (for sent attachments)
      const urlContent = att.content?.find((c: { type: string; text?: string }) => {
        if (c.type === "text") {
          const textContent = c as { type: "text"; text: string };
          return typeof textContent.text === "string" && textContent.text.startsWith("[URL_CONTEXT:");
        }
        return false;
      });
      if (urlContent && urlContent.type === "text") {
        const textContent = urlContent as { type: "text"; text: string };
        const urlMatch = textContent.text.match(/\[URL_CONTEXT:(.+?)\]/);
        if (urlMatch) {
          const url = urlMatch[1];
          return { isUrl: true, src: getFaviconUrl(url), url };
        }
      }

      // Check file name (for pending attachments in composer)
      if (att.file?.name.endsWith('.url')) {
        // Try to extract URL from attachment name first (it's set to the URL in the adapter)
        let url: string | null = null;
        if (att.name) {
          try {
            new URL(att.name);
            url = att.name;
          } catch {
            // Not a valid URL in name, try reading from file
            // Note: We can't async read the file here, so we'll use the name if it's a URL
            // The adapter sets name to the URL when creating URL files
          }
        }
        if (url) {
          return { isUrl: true, src: getFaviconUrl(url), url };
        }
        // If name is not a URL, still mark as URL but without favicon (will show link icon)
        return { isUrl: true };
      }

      // Check if attachment name is a valid URL (for pending attachments)
      if (att.name) {
        try {
          const url = new URL(att.name);
          if (url.protocol === 'http:' || url.protocol === 'https:') {
            return { isUrl: true, src: getFaviconUrl(att.name), url: att.name };
          }
        } catch {
          // Not a valid URL
        }
      }

      if (att.type !== "image") return {};
      if (att.file) return { file: att.file };
      const imageContent = att.content?.find((c: { type: string }) => c.type === "image") as { type: "image"; image: string } | undefined;
      if (imageContent?.image) {
        return { src: imageContent.image };
      }
      return {};
    })
  );

  return {
    src: useFileSrc(attachmentState.file) ?? attachmentState.src,
    isUrl: attachmentState.isUrl,
    url: attachmentState.url
  };
};

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
          : "aui-attachment-preview-image-loading invisible"
      )}
      onLoad={() => setIsLoaded(true)}
    />
  );
};

const AttachmentPreviewDialog: FC<PropsWithChildren> = ({ children }) => {
  const attachmentSrc = useAttachmentSrc();
  const src = attachmentSrc.src;

  if (!src) return children;

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

const AttachmentThumb: FC = () => {
  const isImage = useAuiState(
    ({ attachment }) => (attachment as { type?: string })?.type === "image"
  );
  const attachmentSrc = useAttachmentSrc();
  const { src, isUrl } = attachmentSrc;

  // Show favicon for URLs - styled like file attachments
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

  // Fallback to link icon if URL but no favicon available
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

const AttachmentUI: FC = () => {
  const aui = useAui();
  const isComposer = aui.attachment.source === "composer";

  const isImage = useAuiState(
    ({ attachment }) => (attachment as { type?: string })?.type === "image"
  );

  // Split into separate selectors to avoid creating new objects on each render
  const typeLabel = useAuiState(({ attachment }) => {
    const att = attachment as {
      type?: string;
      name?: string;
      file?: { name: string };
      content?: Array<{ type: string; text?: string }>;
    } | undefined;
    if (!att) return "File";
    // Check if this is a URL attachment by checking:
    // 1. Content with [URL_CONTEXT:...] marker (after send)
    // 2. File name ending with .url (before send)
    // 3. Attachment name being a valid URL (before send)

    // Check content first (for sent attachments)
    const urlContent = att.content?.find((c: { type: string; text?: string }) => {
      if (c.type === "text") {
        const textContent = c as { type: "text"; text: string };
        return typeof textContent.text === "string" && textContent.text.startsWith("[URL_CONTEXT:");
      }
      return false;
    });
    if (urlContent && urlContent.type === "text") {
      const textContent = urlContent as { type: "text"; text: string };
      const urlMatch = textContent.text.match(/\[URL_CONTEXT:(.+?)\]/);
      if (urlMatch) {
        return "URL";
      }
    }

    // Check file name (for pending attachments in composer)
    if (att.file?.name.endsWith('.url')) {
      return "URL";
    }

    // Check if attachment name is a valid URL (for pending attachments)
    if (att.name) {
      try {
        const url = new URL(att.name);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          return "URL";
        }
      } catch {
        // Not a valid URL
      }
    }

    const type = att.type;
    switch (type) {
      case "image":
        return "Image";
      case "document":
        return "Document";
      case "file":
        return "File";
      default:
        return "File";
    }
  });

  const isUrl = useAuiState(({ attachment }) => {
    const att = attachment as {
      type?: string;
      name?: string;
      file?: { name: string };
      content?: Array<{ type: string; text?: string }>;
    } | undefined;
    if (!att) return false;
    // Check if this is a URL attachment by checking:
    // 1. Content with [URL_CONTEXT:...] marker (after send)
    // 2. File name ending with .url (before send)
    // 3. Attachment name being a valid URL (before send)

    // Check content first (for sent attachments)
    const urlContent = att.content?.find((c: { type: string; text?: string }) => {
      if (c.type === "text") {
        const textContent = c as { type: "text"; text: string };
        return typeof textContent.text === "string" && textContent.text.startsWith("[URL_CONTEXT:");
      }
      return false;
    });
    if (urlContent && urlContent.type === "text") {
      const textContent = urlContent as { type: "text"; text: string };
      const urlMatch = textContent.text.match(/\[URL_CONTEXT:(.+?)\]/);
      if (urlMatch) {
        return true;
      }
    }

    // Check file name (for pending attachments in composer)
    if (att.file?.name.endsWith('.url')) {
      return true;
    }

    // Check if attachment name is a valid URL (for pending attachments)
    if (att.name) {
      try {
        const url = new URL(att.name);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          return true;
        }
      } catch {
        // Not a valid URL
      }
    }

    return false;
  });

  return (
    <Tooltip>
      <AttachmentPrimitive.Root
        className={cn(
          "aui-attachment-root relative flex flex-col items-center gap-1.5 max-w-[100px]",
          isImage &&
          "aui-attachment-root-composer only:[&>#attachment-tile]:size-24",
        )}
      >
        <div className="relative">
          <AttachmentPreviewDialog>
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
                <AttachmentThumb />
              </div>
            </TooltipTrigger>
          </AttachmentPreviewDialog>
          {isComposer && <AttachmentRemove />}
        </div>
        <div className="text-[11px] text-muted-foreground w-full truncate text-center px-1 leading-tight">
          <AttachmentPrimitive.Name />
        </div>
      </AttachmentPrimitive.Root>
      <TooltipContent side="top">
        <AttachmentPrimitive.Name />
      </TooltipContent>
    </Tooltip>
  );
};

const AttachmentRemove: FC = () => {
  const { isUrl } = useAttachmentSrc();

  return (
    <AttachmentPrimitive.Remove asChild>
      <TooltipIconButton
        tooltip={isUrl ? "Remove URL" : "Remove file"}
        className="aui-attachment-tile-remove absolute top-1.5 right-1.5 size-3.5 rounded-full bg-white text-muted-foreground opacity-100 shadow-sm hover:bg-white! [&_svg]:text-black hover:[&_svg]:text-destructive"
        side="top"
      >
        <XIcon className="aui-attachment-remove-icon size-3 dark:stroke-[2.5px]" />
      </TooltipIconButton>
    </AttachmentPrimitive.Remove>
  );
};

export const UserMessageAttachments: FC = () => {
  return (
    <div className="aui-user-message-attachments-end col-span-full col-start-1 row-start-1 flex w-full flex-row justify-end gap-2">
      <MessagePrimitive.Attachments components={{ Attachment: AttachmentUI }} />
    </div>
  );
};

export const ComposerAttachments: FC = () => {
  return (
    <div className="aui-composer-attachments mb-2 flex w-full flex-row items-center gap-2 overflow-x-auto px-1.5 pt-0.5 pb-1 empty:hidden">
      <ComposerPrimitive.Attachments
        components={{ Attachment: AttachmentUI }}
      />
    </div>
  );
};


export const ComposerAddAttachment: FC = () => {

  const [showUrlDialog, setShowUrlDialog] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const aui = useAui();







  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const MAX_FILES = 10;
    const MAX_FILE_SIZE_MB = 10;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

    const fileArray = Array.from(files);

    // Check file count limit
    if (fileArray.length > MAX_FILES) {
      toast.error(`You can only upload up to ${MAX_FILES} files at once. You selected ${fileArray.length} files.`, {
        style: { color: '#fff' },
        duration: 5000,
      });
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    // Validate each file
    const validFiles: File[] = [];
    const oversizedFiles: string[] = [];

    fileArray.forEach((file) => {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        oversizedFiles.push(`${file.name} (${(file.size / (1024 * 1024)).toFixed(1)}MB)`);
      } else {
        validFiles.push(file);
      }
    });

    // Show error for oversized files
    if (oversizedFiles.length > 0) {
      toast.error(
        `The following file${oversizedFiles.length > 1 ? 's' : ''} exceed${oversizedFiles.length === 1 ? 's' : ''} the ${MAX_FILE_SIZE_MB}MB limit:\n${oversizedFiles.join('\n')}`,
        {
          style: { color: '#fff' },
          duration: 5000,
        }
      );
    }

    // Add valid files
    if (validFiles.length > 0) {
      validFiles.forEach((file) => {
        aui.composer().addAttachment(file);
      });

      if (validFiles.length < fileArray.length) {
        toast.success(`${validFiles.length} file${validFiles.length > 1 ? 's' : ''} added successfully`, {
          style: { color: '#fff' },
        });
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };



  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = urlInput.trim();
    if (trimmedUrl) {
      try {
        const urlFile = createUrlFile(trimmedUrl);
        aui.composer().addAttachment(urlFile);
        setUrlInput("");
        setShowUrlDialog(false);
        focusComposerInput();
      } catch (error) {
        console.error("Failed to add URL attachment:", error);
      }
    }
  };

  return (
    <>
      <div
        ref={containerRef}
        className="relative flex items-center gap-2 pt-6 pb-6 pl-6 pr-10 -mt-6 -mb-6 -ml-6 -mr-10 pointer-events-none"
      >
        <DropdownMenu open={isDropdownOpen} onOpenChange={(open) => {
          setIsDropdownOpen(open);
          if (!open) {
            focusComposerInput();
          }
        }}>
          <div className="flex items-center gap-2 pointer-events-auto">
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="aui-composer-add-attachment flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-sidebar-accent hover:bg-accent transition-colors flex-shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer ml-1"
                aria-label="Add Attachment"
              >
                <LuPaperclip className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
          </div>
          <DropdownMenuContent
            side="top"
            align="start"
            onCloseAutoFocus={(e) => {
              e.preventDefault();
            }}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1.5 font-normal">
              Attachments
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="cursor-pointer">
              <Upload className="size-4" />
              <span>Upload File</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowUrlDialog(true)} className="cursor-pointer">
              <Link2 className="size-4" />
              <span>Upload Link</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          multiple={true}
          accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,.json"
        />
      </div>

      {/* URL Input Dialog */}
      <Dialog open={showUrlDialog} onOpenChange={(open) => {
        setShowUrlDialog(open);
        if (!open) {
          focusComposerInput();
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Add URL</DialogTitle>
          <form onSubmit={handleUrlSubmit} className="space-y-4">
            <Input
              type="url"
              placeholder="https://example.com"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowUrlDialog(false);
                  setUrlInput("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit">Add URL</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

    </>
  );
};
