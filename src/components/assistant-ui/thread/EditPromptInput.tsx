"use client";

import { Loader2 } from "lucide-react";
import { useState, type FC } from "react";
import {
  PromptInputAddAttachment,
  PromptInputAttachments,
} from "@/components/assistant-ui/attachment";
import { Button } from "@/components/ui/button";
import { ChatPromptInput, usePromptInput } from "@/lib/chat/runtime";
import { useAttachmentUploadStore } from "@/lib/stores/attachment-upload-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const EditPromptInput: FC = () => {
  const promptInput = usePromptInput();
  const hasUploading = useAttachmentUploadStore((s) => s.uploadingIds.size > 0);
  const [originalText] = useState<string>(() => promptInput?.getState()?.text ?? "");
  const [currentText, setCurrentText] = useState<string>(
    () => promptInput?.getState()?.text ?? "",
  );

  return (
    <div className="aui-edit-composer-wrapper mx-auto flex w-full max-w-[var(--thread-max-width)] flex-col gap-4 px-2 first:mt-4 mb-4">
      <ChatPromptInput.Root
        className="aui-edit-composer-root ml-auto flex w-full max-w-7/8 flex-col rounded-xl bg-sidebar-accent border border-sidebar-border"
        onSubmit={(e) => {
          e.preventDefault();

          if (useAttachmentUploadStore.getState().uploadingIds.size > 0) {
            toast.info("Please wait for uploads to finish before sending");
            return;
          }

          promptInput?.send();
        }}
      >
        <PromptInputAttachments />

        <ChatPromptInput.Input
          className="aui-edit-composer-input flex min-h-[60px] w-full resize-none bg-transparent p-4 text-sidebar-foreground outline-none"
          autoFocus
          maxLength={10000}
          onChange={(e) => setCurrentText(e.target.value)}
        />

        <div className="aui-edit-composer-footer mx-3 mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PromptInputAddAttachment />
          </div>
          <div className="flex items-center gap-2">
            <ChatPromptInput.Cancel asChild>
              <Button variant="ghost" size="sm" aria-label="Cancel edit">
                Cancel
              </Button>
            </ChatPromptInput.Cancel>
            <Button
              type="submit"
              size="sm"
              aria-label="Update message"
              disabled={currentText === originalText || hasUploading}
              className={cn(
                (currentText === originalText || hasUploading) &&
                  "opacity-50 cursor-not-allowed",
              )}
            >
              {hasUploading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Uploading...
                </>
              ) : (
                "Update"
              )}
            </Button>
          </div>
        </div>
      </ChatPromptInput.Root>
    </div>
  );
};
