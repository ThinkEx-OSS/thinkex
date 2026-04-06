import {
  ArrowUpIcon,
  Loader2,
  CheckCircle2,
  FileText,
  AlertTriangle,
  Bug,
  Brain,
  Play,
  Search,
  Square,
} from "lucide-react";
import { LuBook } from "react-icons/lu";
import { PiCardsThreeBold } from "react-icons/pi";

import type { ComponentType, FC, MouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  AuiIf,
  ComposerPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import { useFeatureFlagEnabled } from "posthog-js/react";

import Link from "next/link";

import { AIFeedbackDialog } from "@/components/assistant-ui/AIFeedbackDialog";
import { ModelPicker } from "@/components/assistant-ui/ModelPicker";
import {
  PromptBuilderDialog,
  type PromptBuilderAction,
} from "@/components/assistant-ui/PromptBuilderDialog";
import { SpeechToTextButton } from "@/components/assistant-ui/SpeechToTextButton";
import {
  ComposerAddAttachment,
  ComposerAttachments,
} from "@/components/assistant-ui/attachment";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { CardContextDisplay } from "@/components/chat/CardContextDisplay";
import { MentionMenu } from "@/components/chat/MentionMenu";
import { ReplyContextDisplay } from "@/components/chat/ReplyContextDisplay";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSession } from "@/lib/auth-client";
import { useAttachmentUploadStore } from "@/lib/stores/attachment-upload-store";
import { cn } from "@/lib/utils";
import { focusComposerInput } from "@/lib/utils/composer-utils";
import type { Item } from "@/lib/workspace-state/types";

import { useThreadComposer } from "./use-thread-composer";

type FloatingAction = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  iconClassName: string;
  action?: PromptBuilderAction;
  useDialog?: boolean;
  composerFill?: string;
  subActions?: Array<{
    id: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
    iconClassName: string;
    action: PromptBuilderAction;
  }>;
};

type ComposerStateSlice = {
  composer?: {
    attachments?: readonly unknown[];
    text?: string;
  };
};

const COMPOSER_FLOATING_ACTIONS: FloatingAction[] = [
  {
    id: "document",
    label: "Document",
    icon: FileText,
    iconClassName: "size-3.5 shrink-0 text-sky-400",
    action: "document",
    useDialog: true,
  },
  {
    id: "learn",
    label: "Learn",
    icon: LuBook,
    iconClassName: "size-3.5 shrink-0 text-amber-500",
    subActions: [
      {
        id: "flashcards",
        label: "Flashcards",
        icon: PiCardsThreeBold,
        iconClassName: "size-4 rotate-180 text-purple-400",
        action: "flashcards",
      },
      {
        id: "quiz",
        label: "Quiz",
        icon: Brain,
        iconClassName: "size-4 text-green-400",
        action: "quiz",
      },
    ],
  },
  {
    id: "youtube",
    label: "YouTube",
    icon: Play,
    iconClassName: "size-3.5 text-red-500",
    action: "youtube",
    useDialog: true,
  },
  {
    id: "search",
    label: "Search",
    icon: Search,
    iconClassName: "size-3.5 text-teal-500",
    action: "search",
    useDialog: true,
  },
];

const FLOATING_MENU_HIDE_DELAY_MS = 400;

interface ComposerHoverWrapperProps {
  items: Item[];
}

export const ComposerHoverWrapper: FC<ComposerHoverWrapperProps> = ({ items }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [dialogAction, setDialogAction] = useState<PromptBuilderAction | null>(
    null,
  );
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const aui = useAui();

  const isThreadEmpty = useAuiState(({ thread }) => thread?.isEmpty ?? true);
  const composerText = useAuiState(
    (state) => (state as ComposerStateSlice).composer?.text ?? "",
  );
  const hasComposerText = Boolean(composerText.trim());

  const handleDirectFill = useCallback(
    (fill: string) => {
      aui?.composer()?.setText(fill);
      focusComposerInput(true);
    },
    [aui],
  );

  const handleMouseEnter = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, FLOATING_MENU_HIDE_DELAY_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="relative">
      <div
        className="relative"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className={cn(
            "absolute bottom-full left-0 right-0 z-20 flex justify-center gap-0.5 pb-2 transition-opacity duration-150 ease-out",
            !isThreadEmpty && isHovered && !hasComposerText
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0",
          )}
        >
          <div className="flex flex-wrap items-center justify-center gap-0.5 rounded-xl border border-sidebar-border bg-sidebar-accent px-1.5 py-1 shadow-md dark:border-sidebar-border/15">
            {COMPOSER_FLOATING_ACTIONS.map((action) => {
              if (action.subActions) {
                const Icon = action.icon;
                return (
                  <DropdownMenu key={action.id}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-normal text-sidebar-foreground transition-colors",
                          "hover:bg-sidebar-foreground/10 dark:hover:bg-sidebar-foreground/15",
                        )}
                        aria-label={action.label}
                      >
                        <Icon className={action.iconClassName} />
                        <span>{action.label}</span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="center"
                      side="top"
                      className="min-w-[140px]"
                      sideOffset={4}
                    >
                      {action.subActions.map((subAction) => {
                        const SubIcon = subAction.icon;
                        return (
                          <DropdownMenuItem
                            key={subAction.id}
                            onSelect={() => setDialogAction(subAction.action)}
                            className="flex cursor-pointer items-center gap-2"
                          >
                            <SubIcon className={subAction.iconClassName} />
                            {subAction.label}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              }

              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => {
                    if (action.useDialog && action.action) {
                      setDialogAction(action.action);
                      return;
                    }

                    if (action.composerFill) {
                      handleDirectFill(action.composerFill);
                    }
                  }}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-normal text-sidebar-foreground transition-colors",
                    "hover:bg-sidebar-foreground/10 dark:hover:bg-sidebar-foreground/15",
                  )}
                  aria-label={action.label}
                >
                  <Icon className={action.iconClassName} />
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <ThreadComposer items={items} />

        {dialogAction ? (
          <PromptBuilderDialog
            open
            onOpenChange={(open) => !open && setDialogAction(null)}
            action={dialogAction}
            items={items}
          />
        ) : null}
      </div>
    </div>
  );
};

const ThreadComposer: FC<ComposerHoverWrapperProps> = ({ items }) => {
  const {
    canReplyOnlySend,
    handleInput,
    handleKeyDown,
    handleMentionMenuClose,
    handleMentionSelect,
    handlePaste,
    handleSendClick,
    handleSubmit,
    inputRef,
    mentionMenuOpen,
    mentionQuery,
    selectedCardIds,
  } = useThreadComposer();

  return (
    <ComposerPrimitive.Root
      className="aui-composer-root relative flex w-full flex-col rounded-lg border border-sidebar-border bg-sidebar-accent px-3.5 pt-2 pb-1 shadow-[0_9px_9px_0px_rgba(0,0,0,0.01),0_2px_5px_0px_rgba(0,0,0,0.06)] dark:border-sidebar-border/15"
      onClick={(e) => {
        if (inputRef.current && !e.defaultPrevented) {
          inputRef.current.focus();
        }
      }}
      onSubmit={handleSubmit}
    >
      <ComposerAttachments />
      <CardContextDisplay items={items} />
      <ReplyContextDisplay />

      <div className="relative">
        <ComposerPrimitive.Input
          ref={inputRef}
          placeholder="Ask anything or @mention items"
          className="aui-composer-input max-h-32 w-full resize-none bg-transparent py-1.5 text-base text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/60 focus:outline-none"
          rows={1}
          aria-label="Message input"
          maxLength={10000}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
        />
        <MentionMenu
          open={mentionMenuOpen}
          onOpenChange={handleMentionMenuClose}
          query={mentionQuery}
          items={items}
          onSelect={handleMentionSelect}
          selectedCardIds={selectedCardIds}
          selectedIndicator={(isSelected) =>
            isSelected ? (
              <CheckCircle2 className="size-4 flex-shrink-0 text-primary" />
            ) : undefined
          }
        />
      </div>

      <ComposerAction
        canReplyOnlySend={canReplyOnlySend}
        onSendClick={handleSendClick}
      />
    </ComposerPrimitive.Root>
  );
};

interface ComposerActionProps {
  canReplyOnlySend: boolean;
  onSendClick: (e: MouseEvent<HTMLButtonElement>) => void;
}

const ComposerAction: FC<ComposerActionProps> = ({
  canReplyOnlySend,
  onSendClick,
}) => {
  const { data: session } = useSession();
  const hasUploading = useAttachmentUploadStore((state) => state.uploadingIds.size > 0);
  const isAnonymous = session?.user?.isAnonymous ?? false;
  const composerText = useAuiState(
    (state) => (state as ComposerStateSlice).composer?.text ?? "",
  );
  const composerAttachmentCount = useAuiState(
    (state) =>
      (state as ComposerStateSlice).composer?.attachments?.length ?? 0,
  );
  const shouldUseManualReplyOnlySend =
    canReplyOnlySend &&
    !composerText.trim() &&
    composerAttachmentCount === 0;

  const [isWarningPopoverOpen, setIsWarningPopoverOpen] = useState(false);
  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
          <ComposerAddAttachment />
        </div>
        <ModelPicker />

        {showAiDebugButton ? (
          <button
            type="button"
            className="ml-2 flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-red-500/20 bg-red-500/10 px-1.5 py-1 text-xs font-normal text-red-500 transition-colors hover:bg-red-500/20 hover:text-red-400"
            onClick={() => {
              if (isDev) {
                window.open("http://localhost:4983", "_blank");
              } else {
                setIsFeedbackDialogOpen(true);
              }
            }}
          >
            <Bug className="h-3.5 w-3.5" />
            <span>AI Debug</span>
          </button>
        ) : null}

        <AIFeedbackDialog
          open={isFeedbackDialogOpen}
          onOpenChange={setIsFeedbackDialogOpen}
        />

        {isAnonymous ? (
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
                className="flex h-5 w-5 flex-shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-accent"
                aria-label="Warning: AI chats won't save unless logged in"
              >
                <AlertTriangle className="h-4 w-4 animate-[pulse-scale_3.5s_ease-in-out_infinite] text-yellow-500" />
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
                  Your AI chats won&apos;t save unless you are logged in.
                </p>
                <div className="flex items-center gap-2">
                  <Link href="/auth/sign-in" className="flex-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-full text-xs"
                      onClick={() => setIsWarningPopoverOpen(false)}
                    >
                      Sign in
                    </Button>
                  </Link>
                  <Link href="/auth/sign-up" className="flex-1">
                    <Button
                      size="sm"
                      className="h-7 w-full text-xs"
                      onClick={() => setIsWarningPopoverOpen(false)}
                    >
                      Sign up
                    </Button>
                  </Link>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {!isAnonymous ? <SpeechToTextButton /> : null}

        <AuiIf condition={({ thread }) => !thread.isRunning}>
          {shouldUseManualReplyOnlySend ? (
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
                <Loader2 className="aui-composer-send-icon size-4 animate-spin text-background" />
              ) : (
                <ArrowUpIcon className="aui-composer-send-icon size-4 text-background" />
              )}
            </TooltipIconButton>
          ) : (
            <ComposerPrimitive.Send asChild>
              <TooltipIconButton
                tooltip={hasUploading ? "Uploading attachments..." : "Send message"}
                side="bottom"
                variant="default"
                size="icon"
                className="aui-composer-send size-[34px] rounded-full p-1"
                aria-label="Send message"
                disabled={hasUploading}
                onClick={onSendClick}
              >
                {hasUploading ? (
                  <Loader2 className="aui-composer-send-icon size-4 animate-spin text-background" />
                ) : (
                  <ArrowUpIcon className="aui-composer-send-icon size-4 text-background" />
                )}
              </TooltipIconButton>
            </ComposerPrimitive.Send>
          )}
        </AuiIf>

        <AuiIf condition={({ thread }) => thread.isRunning}>
          <ComposerPrimitive.Cancel asChild>
            <Button
              type="button"
              variant="default"
              size="icon"
              className="aui-composer-cancel size-[34px] rounded-full border border-muted-foreground/60 hover:bg-primary/75 dark:border-muted-foreground/90"
              aria-label="Stop generating"
            >
              <Square className="aui-composer-cancel-icon size-3 fill-current text-background" />
            </Button>
          </ComposerPrimitive.Cancel>
        </AuiIf>
      </div>
    </div>
  );
};
