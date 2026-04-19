"use client";

import { PromptInputAddAttachment } from "@/components/assistant-ui/attachment";
import { AIFeedbackDialog } from "@/components/assistant-ui/AIFeedbackDialog";
import { ModelPicker } from "@/components/assistant-ui/ModelPicker";
import { ModelSettingsMenu } from "@/components/assistant-ui/ModelSettingsMenu";
import { SpeechToTextButton } from "@/components/assistant-ui/SpeechToTextButton";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSession } from "@/lib/auth-client";
import { ChatIf, ChatPromptInput } from "@/lib/chat/runtime";
import { useAttachmentUploadStore } from "@/lib/stores/attachment-upload-store";
import { focusComposerInput } from "@/lib/utils/composer-utils";
import { AlertTriangle, ArrowUpIcon, Bug, Loader2, Square } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FC } from "react";
import { useFeatureFlagEnabled } from "posthog-js/react";

export const PromptInputToolbar: FC = () => {
  const { data: session } = useSession();
  const hasUploading = useAttachmentUploadStore((s) => s.uploadingIds.size > 0);
  const isAnonymous = session?.user?.isAnonymous ?? false;
  const [isWarningPopoverOpen, setIsWarningPopoverOpen] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
  const isDev = process.env.NODE_ENV === "development";
  const aiDebugFlagEnabled = useFeatureFlagEnabled("ai-debug-feedback");
  const showAiDebugButton = isDev || aiDebugFlagEnabled === true;

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="aui-composer-action-wrapper relative mb-2 flex items-center justify-between">
      <div className="relative z-0 flex items-center gap-0">
        <div className="relative z-0">
          <PromptInputAddAttachment />
        </div>
        {!isAnonymous && <ModelSettingsMenu />}
        <div className={!isAnonymous ? "ml-0.5" : undefined}>
          <ModelPicker />
        </div>
        {showAiDebugButton && (
          <button
            type="button"
            className="ml-2 flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 transition-colors flex-shrink-0 text-xs font-normal text-red-500 hover:text-red-400 cursor-pointer border border-red-500/20"
            onClick={() => {
              if (process.env.NODE_ENV === "development") {
                window.open("http://localhost:4983", "_blank");
              } else {
                setIsFeedbackDialogOpen(true);
              }
            }}
          >
            <Bug className="w-3.5 h-3.5" />
            <span>AI Debug</span>
          </button>
        )}
        <AIFeedbackDialog
          open={isFeedbackDialogOpen}
          onOpenChange={setIsFeedbackDialogOpen}
        />
        {isAnonymous && (
          <Popover
            open={isWarningPopoverOpen}
            onOpenChange={(open) => {
              setIsWarningPopoverOpen(open);
              if (!open) {
                focusComposerInput();
              }
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                onMouseEnter={() => {
                  if (hoverTimeoutRef.current) {
                    clearTimeout(hoverTimeoutRef.current);
                  }
                  setIsWarningPopoverOpen(true);
                }}
                onMouseLeave={() => {
                  hoverTimeoutRef.current = setTimeout(() => {
                    setIsWarningPopoverOpen(false);
                  }, 100);
                }}
                className="flex items-center justify-center w-5 h-5 rounded-md hover:bg-accent transition-colors flex-shrink-0 cursor-pointer"
                aria-label="Warning: AI chats won't save unless logged in"
              >
                <AlertTriangle className="w-4 h-4 text-yellow-500 animate-[pulse-scale_3.5s_ease-in-out_infinite]" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={8}
              onMouseEnter={() => {
                if (hoverTimeoutRef.current) {
                  clearTimeout(hoverTimeoutRef.current);
                }
                setIsWarningPopoverOpen(true);
              }}
              onMouseLeave={() => {
                hoverTimeoutRef.current = setTimeout(() => {
                  setIsWarningPopoverOpen(false);
                }, 100);
              }}
              className="w-64 p-3"
            >
              <div className="space-y-3">
                <p className="text-sm text-foreground">
                  Your AI chats won't save unless you are logged in.
                </p>
                <div className="flex items-center gap-2">
                  <Link href="/auth/sign-in" className="flex-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-7 text-xs"
                      onClick={() => setIsWarningPopoverOpen(false)}
                    >
                      Sign in
                    </Button>
                  </Link>
                  <Link href="/auth/sign-up" className="flex-1">
                    <Button
                      size="sm"
                      className="w-full h-7 text-xs"
                      onClick={() => setIsWarningPopoverOpen(false)}
                    >
                      Sign up
                    </Button>
                  </Link>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!isAnonymous && <SpeechToTextButton />}
        <ChatIf condition={({ thread }) => !thread.isRunning}>
          <TooltipIconButton
            tooltip={hasUploading ? "Uploading attachments..." : "Send message"}
            side="bottom"
            type="submit"
            variant="default"
            size="icon"
            className="aui-composer-send size-[34px] rounded-full p-1"
            aria-label="Send message"
            disabled={hasUploading}
          >
            {hasUploading ? (
              <Loader2 className="aui-composer-send-icon size-4 text-background animate-spin" />
            ) : (
              <ArrowUpIcon className="aui-composer-send-icon size-4 text-background" />
            )}
          </TooltipIconButton>
        </ChatIf>

        <ChatIf condition={({ thread }) => thread.isRunning}>
          <ChatPromptInput.Cancel asChild>
            <Button
              type="button"
              variant="default"
              size="icon"
              className="aui-composer-cancel size-[34px] rounded-full border border-muted-foreground/60 hover:bg-primary/75 dark:border-muted-foreground/90"
              aria-label="Stop generating"
            >
              <Square className="aui-composer-cancel-icon size-3 text-background fill-current" />
            </Button>
          </ChatPromptInput.Cancel>
        </ChatIf>
      </div>
    </div>
  );
};
