import {
  ArrowUpIcon,
  CheckIcon,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  FileText,
  Upload,
  PencilIcon,
  PlusSquareIcon,
  RefreshCwIcon,
  Square,
  GalleryHorizontalEnd,
  AlertTriangle,
  Sparkles,
  Bug,
  Brain,
  Play,
  Search,
} from "lucide-react";
import { FaWandMagicSparkles } from "react-icons/fa6";
import { LuBook } from "react-icons/lu";
import { PiCardsThreeBold } from "react-icons/pi";
import { cn } from "@/lib/utils";
import {
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useMessage,
  useMessagePartText,
  useAuiState,
} from "@assistant-ui/react";

import type { FC } from "react";
import { createContext, useContext } from "react";
import { memo, useEffect, useRef, useState, useMemo, useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import Link from "next/link";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { AIFeedbackDialog } from "@/components/assistant-ui/AIFeedbackDialog";

import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { useAttachmentUploadStore } from "@/lib/stores/attachment-upload-store";
import {
  ComposerAttachments,
  ComposerAddAttachment,
  UserMessageAttachments,
} from "@/components/assistant-ui/attachment";
import { AssistantLoader } from "@/components/assistant-ui/assistant-loader";
import { File as FileComponent } from "@/components/assistant-ui/file";
import { isOfficeDocument } from "@/lib/uploads/office-document-validation";
import { Sources } from "@/components/assistant-ui/sources";
import { Image } from "@/components/assistant-ui/image";
import { Reasoning, ReasoningGroup } from "@/components/assistant-ui/reasoning";
import { ToolGroup } from "@/components/assistant-ui/tool-group";

import type { Item } from "@/lib/workspace-state/types";
import { CardContextDisplay } from "@/components/chat/CardContextDisplay";
import { ReplyContextDisplay } from "@/components/chat/ReplyContextDisplay";
import { MessageContextBadges } from "@/components/chat/MessageContextBadges";
import { MentionMenu } from "@/components/chat/MentionMenu";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useUIStore, selectReplySelections } from "@/lib/stores/ui-store";
import { useSelectedCardIds } from "@/hooks/ui/use-selected-card-ids";
import { useShallow } from "zustand/react/shallow";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { toast } from "sonner";
import { useSession } from "@/lib/auth-client";
import { focusComposerInput } from "@/lib/utils/composer-utils";
import { buildWorkspaceItemDefinitionsFromAssets } from "@/lib/uploads/uploaded-asset";
import { uploadSelectedFiles } from "@/lib/uploads/upload-selection";
import { startAssetProcessing } from "@/lib/uploads/start-asset-processing";
import {
  getDocumentUploadFailureMessage,
  getDocumentUploadPartialMessage,
  getDocumentUploadSuccessMessage,
} from "@/lib/uploads/upload-feedback";
import { SpeechToTextButton } from "@/components/assistant-ui/SpeechToTextButton";
import {
  PromptBuilderDialog,
  type PromptBuilderAction,
} from "@/components/assistant-ui/PromptBuilderDialog";
import { ModelPicker } from "@/components/assistant-ui/ModelPicker";
import { ThinkExLogo } from "@/components/ui/thinkex-logo";

interface ThreadProps {
  items?: Item[];
}

interface AssistantMessageContextType {
  isRunning: boolean;
  isLastMessage: boolean;
  isEmpty: boolean;
}

const AssistantMessageContext = createContext<AssistantMessageContextType>({
  isRunning: false,
  isLastMessage: false,
  isEmpty: true,
});

export const useAssistantMessageContext = () =>
  useContext(AssistantMessageContext);

export const Thread: FC<ThreadProps> = ({ items = [] }) => {
  const viewportRef = useRef<HTMLDivElement>(null);

  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root @container flex h-full flex-col bg-sidebar"
      style={{
        ["--thread-max-width" as string]: "50rem",
      }}
    >
      <ThreadPrimitive.Viewport
        ref={viewportRef}
        turnAnchor="top"
        autoScroll={false}
        className="aui-thread-viewport relative flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-scroll px-4"
      >
        <AuiIf condition={({ thread }) => thread.isLoading}>
          <ThreadLoadingSkeleton />
        </AuiIf>
        <AuiIf condition={({ thread }) => thread.isEmpty && !thread.isLoading}>
          <ThreadWelcome items={items} />
        </AuiIf>

        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            EditComposer,
            AssistantMessage,
          }}
        />
      </ThreadPrimitive.Viewport>

      <div className="aui-thread-composer-wrapper mx-auto flex w-full max-w-[var(--thread-max-width)] flex-shrink-0 flex-col gap-4 overflow-visible rounded-t-3xl bg-sidebar px-4 pb-3 md:pb-4">
        <ComposerHoverWrapper items={items} />
      </div>
    </ThreadPrimitive.Root>
  );
};

const ThreadLoadingSkeleton: FC = () => {
  return (
    <div
      role="status"
      aria-label="Loading chat"
      className="aui-thread-loading-skeleton mx-auto flex w-full max-w-[var(--thread-max-width)] flex-col gap-6 px-2 py-8"
    >
      {/* User message skeleton (right-aligned) */}
      <div className="flex justify-end">
        <div className="max-w-[85%] space-y-2">
          <Skeleton className="h-12 w-48 rounded-lg" />
        </div>
      </div>
      {/* Assistant message skeleton (left-aligned) */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-full max-w-[90%] rounded" />
        <Skeleton className="h-4 w-full max-w-[70%] rounded" />
        <Skeleton className="h-4 w-32 rounded" />
      </div>
      {/* User message skeleton */}
      <div className="flex justify-end">
        <Skeleton className="h-10 w-64 rounded-lg" />
      </div>
      {/* Assistant message skeleton - taller */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-full max-w-[95%] rounded" />
        <Skeleton className="h-4 w-full max-w-[80%] rounded" />
        <Skeleton className="h-4 w-full max-w-[60%] rounded" />
        <Skeleton className="h-4 w-24 rounded" />
      </div>
    </div>
  );
};

interface ThreadWelcomeProps {
  items: Item[];
}

const ThreadWelcome: FC<ThreadWelcomeProps> = ({ items }) => {
  return (
    <div className="aui-thread-welcome-root mx-auto my-auto flex w-full max-w-[var(--thread-max-width)] flex-grow flex-col">
      <div className="aui-thread-welcome-center flex w-full flex-grow flex-col items-center justify-center">
        <div className="aui-thread-welcome-message flex size-full flex-col items-center justify-center px-8">
          <div className="aui-thread-welcome-message-motion-0 mb-1 flex justify-center">
            <div className="relative flex h-12 w-12 items-center justify-center">
              <ThinkExLogo size={48} priority />
            </div>
          </div>
        </div>
      </div>
      <ThreadSuggestions items={items} />
    </div>
  );
};

interface ThreadSuggestionsProps {
  items: Item[];
}

const SUGGESTION_ACTIONS = [
  {
    title: "Search",
    icon: Search,
    iconClassName: "size-4 shrink-0 text-sky-500",
    action: "search" as PromptBuilderAction,
    useDialog: true,
  },
  {
    title: "Flashcards",
    icon: PiCardsThreeBold,
    iconClassName: "size-4 shrink-0 text-purple-400 rotate-180",
    action: "flashcards" as PromptBuilderAction,
    useDialog: true,
  },
  {
    title: "YouTube",
    icon: Play,
    iconClassName: "size-4 shrink-0 text-red-500",
    action: "youtube" as PromptBuilderAction,
    useDialog: true,
  },
  {
    title: "Upload",
    icon: Upload,
    iconClassName: "size-4 shrink-0 text-red-400",
    triggerFileInput: true,
  },
  {
    title: "Quiz",
    icon: Brain,
    iconClassName: "size-4 shrink-0 text-green-400",
    action: "quiz" as PromptBuilderAction,
    useDialog: true,
  },
  {
    title: "Document",
    icon: FileText,
    iconClassName: "size-4 shrink-0 text-sky-400",
    action: "document" as PromptBuilderAction,
    useDialog: true,
  },
];

const ThreadSuggestions: FC<ThreadSuggestionsProps> = ({ items }) => {
  const aui = useAui();
  const [dialogAction, setDialogAction] = useState<PromptBuilderAction | null>(
    null,
  );

  const handleDirectFill = useCallback(
    (action: string) => {
      aui?.composer()?.setText(action);
      focusComposerInput(true);
    },
    [aui],
  );

  const handleTriggerFileInput = useCallback(() => {
    document.getElementById("composer-file-upload")?.click();
    focusComposerInput(true);
  }, []);

  return (
    <>
      <div className="aui-thread-welcome-suggestions grid w-full grid-cols-2 gap-2 pb-4 sm:grid-cols-3">
        {SUGGESTION_ACTIONS.map((suggestedAction, index) => {
          const Icon = suggestedAction.icon;
          return (
            <div
              key={`suggested-action-${suggestedAction.title}-${index}`}
              className="aui-thread-welcome-suggestion-display"
            >
              <Button
                type="button"
                variant="ghost"
                className="aui-thread-welcome-suggestion h-auto w-full flex-1 flex-wrap items-center justify-start gap-2 rounded-lg border border-sidebar-border px-5 py-4 text-left text-sm dark:hover:bg-accent/60"
                aria-label={suggestedAction.title}
                onClick={() => {
                  if (
                    "triggerFileInput" in suggestedAction &&
                    suggestedAction.triggerFileInput
                  ) {
                    handleTriggerFileInput();
                  } else if (
                    suggestedAction.useDialog &&
                    "action" in suggestedAction &&
                    suggestedAction.action
                  ) {
                    setDialogAction(suggestedAction.action);
                  } else if (
                    "composerFill" in suggestedAction &&
                    typeof suggestedAction.composerFill === "string"
                  ) {
                    handleDirectFill(suggestedAction.composerFill);
                  }
                }}
              >
                <Icon className={suggestedAction.iconClassName} />
                <span className="aui-thread-welcome-suggestion-text-1 font-medium">
                  {suggestedAction.title}
                </span>
              </Button>
            </div>
          );
        })}
      </div>

      {dialogAction && (
        <PromptBuilderDialog
          open={!!dialogAction}
          onOpenChange={(open) => !open && setDialogAction(null)}
          action={dialogAction}
          items={items}
        />
      )}
    </>
  );
};

// Floating action buttons shown above composer on hover
const COMPOSER_FLOATING_ACTIONS = [
  {
    id: "document",
    label: "Document",
    icon: FileText,
    iconClassName: "size-3.5 shrink-0 text-sky-400",
    action: "document" as PromptBuilderAction,
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
        iconClassName: "size-4 text-purple-400 rotate-180",
        action: "flashcards" as PromptBuilderAction,
      },
      {
        id: "quiz",
        label: "Quiz",
        icon: Brain,
        iconClassName: "size-4 text-green-400",
        action: "quiz" as PromptBuilderAction,
      },
    ],
  },
  {
    id: "youtube",
    label: "YouTube",
    icon: Play,
    iconClassName: "size-3.5 text-red-500",
    action: "youtube" as PromptBuilderAction,
    useDialog: true,
  },
  {
    id: "search",
    label: "Search",
    icon: Search,
    iconClassName: "size-3.5 text-teal-500",
    action: "search" as PromptBuilderAction,
    useDialog: true,
  },
];

interface ComposerHoverWrapperProps {
  items: Item[];
}

const FLOATING_MENU_HIDE_DELAY_MS = 400;

const ComposerHoverWrapper: FC<ComposerHoverWrapperProps> = ({ items }) => {
  const [isHovered, setIsHovered] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const aui = useAui();
  const [dialogAction, setDialogAction] = useState<PromptBuilderAction | null>(
    null,
  );
  const isThreadEmpty = useAuiState(({ thread }) => thread?.isEmpty ?? true);
  const hasComposerText = useAuiState((s) =>
    Boolean((s as { composer?: { text?: string } })?.composer?.text?.trim()),
  );

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
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  return (
    <div className="relative">
      {/* Composer + floating menu - main hover zone */}
      <div
        className="relative"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Floating buttons - appear above composer on hover */}
        <div
          className={cn(
            "absolute bottom-full left-0 right-0 z-20 flex justify-center gap-0.5 pb-2",
            "transition-opacity duration-150 ease-out",
            !isThreadEmpty && isHovered && !hasComposerText
              ? "opacity-100 pointer-events-auto"
              : "opacity-0 pointer-events-none",
          )}
        >
          <div className="flex flex-wrap items-center justify-center gap-0.5 rounded-xl border border-sidebar-border bg-sidebar-accent px-1.5 py-1 shadow-md dark:border-sidebar-border/15">
            {COMPOSER_FLOATING_ACTIONS.map((action) => {
              if ("subActions" in action) {
                // Learn button with dropdown
                const Icon = action.icon;
                return (
                  <DropdownMenu key={action.id}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-normal",
                          "text-sidebar-foreground transition-colors",
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
                      {(action.subActions ?? []).map((sub) => {
                        const SubIcon = sub.icon;
                        return (
                          <DropdownMenuItem
                            key={sub.id}
                            onSelect={() => setDialogAction(sub.action)}
                            className="flex cursor-pointer items-center gap-2"
                          >
                            <SubIcon className={sub.iconClassName} />
                            {sub.label}
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
                    if (
                      action.useDialog &&
                      "action" in action &&
                      action.action
                    ) {
                      setDialogAction(action.action);
                    } else if (
                      "composerFill" in action &&
                      typeof action.composerFill === "string"
                    ) {
                      handleDirectFill(action.composerFill);
                    }
                  }}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-normal",
                    "text-sidebar-foreground transition-colors",
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

        <Composer items={items} />

        {dialogAction && (
          <PromptBuilderDialog
            open={!!dialogAction}
            onOpenChange={(open) => !open && setDialogAction(null)}
            action={dialogAction}
            items={items}
          />
        )}
      </div>
    </div>
  );
};

interface ComposerProps {
  items: Item[];
}

const Composer = memo(function Composer({ items }: ComposerProps) {
  const currentWorkspaceId = useWorkspaceStore(
    (state) => state.currentWorkspaceId,
  );
  const aui = useAui();
  const replySelections = useUIStore(useShallow(selectReplySelections));
  const clearReplySelections = useUIStore(
    (state) => state.clearReplySelections,
  );
  const { selectedCardIds } = useSelectedCardIds();

  const operations = useWorkspaceOperations(currentWorkspaceId, items);

  const mainThreadId = useAuiState(
    ({ threads }) => (threads as any)?.mainThreadId,
  );
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (mainThreadId && inputRef.current) {
      const timeoutId = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [mainThreadId]);

  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(
    null,
  );
  const toggleCardSelection = useUIStore((state) => state.toggleCardSelection);

  const handleInput = useCallback(
    (e: React.FormEvent<HTMLTextAreaElement>) => {
      const textarea = e.currentTarget;
      const value = textarea.value;
      const cursorPos = textarea.selectionStart ?? 0;

      if (mentionStartIndex !== null) {
        const query = value.slice(mentionStartIndex + 1, cursorPos);

        if (
          cursorPos <= mentionStartIndex ||
          query.includes(" ") ||
          query.includes("\n")
        ) {
          setMentionMenuOpen(false);
          setMentionStartIndex(null);
          setMentionQuery("");
        } else {
          setMentionQuery(query);
        }
      }
    },
    [mentionStartIndex],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = e.currentTarget;

      if (e.key === "@" && !mentionMenuOpen) {
        const cursorPos = textarea.selectionStart ?? 0;
        const charBefore = cursorPos > 0 ? textarea.value[cursorPos - 1] : " ";
        if (charBefore === " " || charBefore === "\n" || cursorPos === 0) {
          setMentionMenuOpen(true);
          setMentionStartIndex(cursorPos);
          setMentionQuery("");
        }
      }

      if (e.key === "Escape" && mentionMenuOpen) {
        e.preventDefault();
        setMentionMenuOpen(false);
        setMentionStartIndex(null);
        setMentionQuery("");
      }

      if (
        mentionMenuOpen &&
        ["ArrowUp", "ArrowDown", "Enter"].includes(e.key)
      ) {
        e.preventDefault();
      }
    },
    [mentionMenuOpen],
  );

  const clearMentionQuery = useCallback(() => {
    if (mentionStartIndex !== null && inputRef.current) {
      const textarea = inputRef.current;
      const currentValue = textarea.value;

      const atSymbolIndex = mentionStartIndex;

      let queryEndIndex = mentionStartIndex;
      while (
        queryEndIndex < currentValue.length &&
        currentValue[queryEndIndex] !== " " &&
        currentValue[queryEndIndex] !== "\n"
      ) {
        queryEndIndex++;
      }

      const textBefore = currentValue.substring(0, atSymbolIndex);
      const textAfter = currentValue.substring(queryEndIndex);

      const newValue = textBefore + textAfter;

      aui?.composer()?.setText(newValue);

      setMentionQuery("");
      setMentionStartIndex(null);

      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const newCursorPos = textBefore.length;
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    }
  }, [mentionStartIndex, aui]);

  const handleMentionSelect = useCallback(
    (item: Item) => {
      toggleCardSelection(item.id);
    },
    [toggleCardSelection],
  );

  const handleMentionMenuClose = useCallback(
    (open: boolean) => {
      if (!open) {
        clearMentionQuery();
      }
      setMentionMenuOpen(open);
    },
    [clearMentionQuery],
  );

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData || !currentWorkspaceId) return;

    const files = Array.from(clipboardData.files) as File[];

    if (files.length > 0) {
      e.preventDefault();
      const imageFile = files.find((file: File) =>
        file.type.startsWith("image/"),
      );
      const fileToUpload = imageFile || files[0];

      if (fileToUpload) {
        try {
          await aui?.composer()?.addAttachment(fileToUpload);
        } catch (error) {
          console.error("Failed to add file attachment:", error);
        }
      }
      return;
    }

    const clipboardItems = Array.from(
      clipboardData.items,
    ) as DataTransferItem[];
    const imageItem = clipboardItems.find((item: DataTransferItem) =>
      item.type.startsWith("image/"),
    );

    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) {
        try {
          await aui?.composer()?.addAttachment(file);
        } catch (error) {
          console.error("Failed to add image attachment:", error);
        }
      }
      return;
    }
  };

  const processPdfAttachmentsInBackground = async (
    pdfAttachments: any[],
    workspaceId: string,
    operations: any,
  ) => {
    let files: File[] = [];
    try {
      files = pdfAttachments
        .map((attachment) => attachment.file)
        .filter((file): file is File => !!file);
      const { uploads, failedFiles } = await uploadSelectedFiles(files);

      if (uploads.length > 0) {
        const pdfCardDefinitions =
          buildWorkspaceItemDefinitionsFromAssets(uploads);
        const createdIds = operations.createItems(pdfCardDefinitions, {
          showSuccessToast: false,
        });

        void startAssetProcessing({
          workspaceId,
          assets: uploads,
          itemIds: createdIds,
          onOcrError: (error) => {
            console.error("Error starting assistant file processing:", error);
          },
        });

        if (failedFiles.length === 0) {
          toast.success(getDocumentUploadSuccessMessage(uploads.length));
        } else {
          toast.warning(
            getDocumentUploadPartialMessage(uploads.length, failedFiles.length),
          );
        }
      } else {
        toast.error(
          getDocumentUploadFailureMessage(failedFiles.length || files.length),
        );
      }
    } catch (error) {
      console.error("Error creating PDF cards in background:", error);
      toast.error(
        getDocumentUploadFailureMessage(files.length || pdfAttachments.length),
      );
    }
  };

  return (
    <ComposerPrimitive.Root
      className="aui-composer-root relative flex w-full flex-col rounded-lg border border-sidebar-border bg-sidebar-accent px-3.5 pt-2 pb-1 shadow-[0_9px_9px_0px_rgba(0,0,0,0.01),0_2px_5px_0px_rgba(0,0,0,0.06)] dark:border-sidebar-border/15"
      onClick={(e) => {
        if (inputRef.current && !e.defaultPrevented) {
          inputRef.current.focus();
        }
      }}
      onSubmit={async (e) => {
        e.preventDefault();

        if (useAttachmentUploadStore.getState().uploadingIds.size > 0) {
          toast.info("Please wait for uploads to finish before sending");
          return;
        }

        const composerState = aui?.composer()?.getState();
        if (!composerState) return;

        const currentText = composerState.text;
        const attachments = composerState.attachments || [];

        const hasReplyContext = replySelections.length > 0;
        if (
          !currentText.trim() &&
          attachments.length === 0 &&
          !hasReplyContext
        ) {
          return;
        }

        const pdfAttachments = attachments.filter((att) => {
          const file = att.file;
          return (
            file &&
            (file.type === "application/pdf" ||
              file.name.toLowerCase().endsWith(".pdf") ||
              isOfficeDocument(file))
          );
        });

        if (pdfAttachments.length > 0 && currentWorkspaceId) {
          processPdfAttachmentsInBackground(
            pdfAttachments,
            currentWorkspaceId,
            operations,
          );
        }

        let modifiedText =
          currentText.trim() || (hasReplyContext ? "Empty message" : "");

        const customMetadata: Record<string, unknown> = {};
        if (replySelections.length > 0) {
          customMetadata.replySelections = replySelections;
        }
        aui
          ?.composer()
          ?.setRunConfig(
            Object.keys(customMetadata).length > 0
              ? { custom: customMetadata }
              : {},
          );

        aui?.composer()?.setText(modifiedText);
        aui?.composer()?.send();

        clearReplySelections();
      }}
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
          autoFocus
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
              <CheckCircle2 className="size-4 text-primary flex-shrink-0" />
            ) : undefined
          }
        />
      </div>
      <ComposerAction />
    </ComposerPrimitive.Root>
  );
});

interface ComposerActionProps {}

const ComposerAction = memo(function ComposerAction(_: ComposerActionProps) {
  const { data: session } = useSession();
  useAui();
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
      {/* Attachment buttons on the left */}
      <div className="relative z-0 flex items-center gap-0">
        <div className="relative z-0">
          <ComposerAddAttachment />
        </div>
        <ModelPicker />
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
      {/* Right side: speech/send/cancel button */}
      <div className="flex items-center gap-2">
        {!isAnonymous && <SpeechToTextButton />}
        <AuiIf condition={({ thread }) => !thread.isRunning}>
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
              <Square className="aui-composer-cancel-icon size-3 text-background fill-current" />
            </Button>
          </ComposerPrimitive.Cancel>
        </AuiIf>
      </div>
    </div>
  );
});

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root mt-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive dark:bg-destructive/5 dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const AssistantMessage: FC = () => {
  const msgCtxRef = useRef<AssistantMessageContextType>({
    isRunning: false,
    isLastMessage: false,
    isEmpty: true,
  });
  const msgCtx = useAuiState(({ thread, message }) => {
    const messages = (
      thread as unknown as { messages?: Array<{ id?: string }> }
    )?.messages;
    const isLastMessage =
      Array.isArray(messages) && messages.length > 0
        ? messages[messages.length - 1]?.id === message.id
        : false;
    const isRunning = message.status?.type === "running";
    const isEmpty =
      !message.content ||
      (Array.isArray(message.content) && message.content.length === 0);

    const next = { isRunning, isLastMessage, isEmpty };
    const prev = msgCtxRef.current;
    if (
      prev.isRunning === next.isRunning &&
      prev.isLastMessage === next.isLastMessage &&
      prev.isEmpty === next.isEmpty
    ) {
      return prev;
    }
    msgCtxRef.current = next;
    return next;
  });

  return (
    <AssistantMessageContext.Provider value={msgCtx}>
      <MessagePrimitive.Root asChild>
        <div
          className="aui-assistant-message-root relative mx-auto w-full max-w-[var(--thread-max-width)] animate-in pb-4 duration-150 ease-out fade-in slide-in-from-bottom-1 last:mb-4"
          data-role="assistant"
        >
          <div className="aui-assistant-message-content mx-2 leading-7 break-words text-foreground">
            <AssistantLoader />
            <MessagePrimitive.Parts
              components={{
                Text: MarkdownText,
                File: FileComponent,
                Source: Sources,
                Image,
                Reasoning: Reasoning,
                ReasoningGroup: ReasoningGroup,
                ToolGroup,
                tools: {
                  Fallback: ToolFallback,
                },
              }}
            />
            <MessageError />
          </div>

          <div className="aui-assistant-message-footer mt-2 ml-2 flex">
            <BranchPicker />
            <AssistantActionBar />
          </div>
        </div>
      </MessagePrimitive.Root>
    </AssistantMessageContext.Provider>
  );
};

const AssistantActionBar: FC = () => {
  const { content } = useMessage();

  const textContent = useMemo(() => {
    const textParts = content.filter(
      (part): part is { type: "text"; text: string } => part.type === "text",
    );
    return textParts.map((part) => part.text ?? "").join("\n\n");
  }, [content]);

  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCopy = useCallback(() => {
    if (!textContent) return;
    navigator.clipboard.writeText(textContent);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }, [textContent]);

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="never"
      className="aui-assistant-action-bar-root col-start-3 row-start-2 -ml-1 flex gap-0.5 text-muted-foreground data-floating:absolute data-floating:rounded-md data-floating:border data-floating:bg-background data-floating:p-1 data-floating:shadow-sm"
    >
      <TooltipIconButton tooltip="Copy" onClick={handleCopy}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </TooltipIconButton>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="Refresh">
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
};

const USER_MESSAGE_MAX_CHARS = 250;

const UserMessageTruncateContext = createContext<{
  maxChars: number;
  expanded: boolean;
  showExpand: boolean;
} | null>(null);

// Custom Text component for UserMessage (plain text + truncation)
const UserMessageText: FC = () => {
  const { text: rawText } = useMessagePartText();
  const truncateCtx = useContext(UserMessageTruncateContext);

  let text = rawText;

  if (
    truncateCtx &&
    !truncateCtx.expanded &&
    truncateCtx.maxChars < Infinity &&
    text.length > truncateCtx.maxChars
  ) {
    text = text.slice(0, truncateCtx.maxChars).trim() + "...";
  }

  return <div className="whitespace-pre-wrap">{text}</div>;
};

const UserMessage: FC = () => {
  const [expanded, setExpanded] = useState(false);
  const message = useMessage();

  const textLength = useMemo(
    () =>
      message.content
        .filter(
          (part): part is { type: "text"; text: string } =>
            part.type === "text",
        )
        .reduce((sum, part) => sum + (part.text?.length ?? 0), 0),
    [message.content],
  );

  const showExpand = textLength > USER_MESSAGE_MAX_CHARS;

  const truncateCtxValue = useMemo(
    () => ({
      maxChars: USER_MESSAGE_MAX_CHARS,
      expanded,
      showExpand,
    }),
    [expanded, showExpand],
  );

  return (
    <MessagePrimitive.Root asChild>
      <div
        className="aui-user-message-root mx-auto grid w-full max-w-[var(--thread-max-width)] animate-breathe-in auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] gap-y-2 px-2 pt-4 pb-1 last:mb-5 [&:where(>*)]:col-start-2"
        data-role="user"
      >
        {/* Attachments display */}
        <UserMessageAttachments />

        <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
          <MessageContextBadges />
          <UserMessageTruncateContext.Provider value={truncateCtxValue}>
            <div className="aui-user-message-content relative rounded-lg bg-muted px-3 py-2 break-words text-foreground text-sm">
              <MessagePrimitive.Parts
                components={{
                  Text: UserMessageText,
                  File: FileComponent,
                }}
              />
              {showExpand && (
                <div className="flex justify-end pt-1.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => !e)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={expanded ? "Show less" : "Show more"}
                  >
                    {expanded ? (
                      <ChevronUp className="size-3.5" />
                    ) : (
                      <ChevronDown className="size-3.5" />
                    )}
                    {expanded ? "Show less" : "Show more"}
                  </button>
                </div>
              )}
            </div>
          </UserMessageTruncateContext.Provider>
        </div>

        <div className="aui-user-message-footer ml-2 flex justify-end col-start-2 relative min-h-[20px]">
          <div className="absolute right-0">
            <UserActionBar />
          </div>
        </div>

        <BranchPicker className="aui-user-branch-picker col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
      </div>
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  const message = useMessage();
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const textContent = useMemo(() => {
    return message.content
      .filter(
        (part): part is { type: "text"; text: string } => part.type === "text",
      )
      .map((part) => part.text ?? "")
      .join("\n\n");
  }, [message.content]);

  const handleCopy = useCallback(() => {
    if (!textContent) return;
    navigator.clipboard.writeText(textContent);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }, [textContent]);

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex gap-1 text-muted-foreground data-floating:absolute data-floating:rounded-md data-floating:border data-floating:bg-background data-floating:p-1 data-floating:shadow-sm"
    >
      <TooltipIconButton tooltip="Copy" onClick={handleCopy}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </TooltipIconButton>
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  const aui = useAui();
  const hasUploading = useAttachmentUploadStore((s) => s.uploadingIds.size > 0);
  const [originalText, setOriginalText] = useState<string>(
    () => aui?.composer()?.getState()?.text ?? "",
  );
  const [currentText, setCurrentText] = useState<string>(
    () => aui?.composer()?.getState()?.text ?? "",
  );

  return (
    <div className="aui-edit-composer-wrapper mx-auto flex w-full max-w-[var(--thread-max-width)] flex-col gap-4 px-2 first:mt-4 mb-4">
      <ComposerPrimitive.Root
        className="aui-edit-composer-root ml-auto flex w-full max-w-7/8 flex-col rounded-xl bg-sidebar-accent border border-sidebar-border"
        onSubmit={(e) => {
          e.preventDefault();

          if (useAttachmentUploadStore.getState().uploadingIds.size > 0) {
            toast.info("Please wait for uploads to finish before sending");
            return;
          }

          aui?.composer()?.send();
        }}
      >
        <ComposerAttachments />

        <ComposerPrimitive.Input
          className="aui-edit-composer-input flex min-h-[60px] w-full resize-none bg-transparent p-4 text-sidebar-foreground outline-none"
          autoFocus
          maxLength={10000}
          onChange={(e) => setCurrentText(e.target.value)}
        />

        <div className="aui-edit-composer-footer mx-3 mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ComposerAddAttachment />
          </div>
          <div className="flex items-center gap-2">
            <ComposerPrimitive.Cancel asChild>
              <Button variant="ghost" size="sm" aria-label="Cancel edit">
                Cancel
              </Button>
            </ComposerPrimitive.Cancel>
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
      </ComposerPrimitive.Root>
    </div>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root mr-2 -ml-2 inline-flex items-center text-xs text-muted-foreground",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
