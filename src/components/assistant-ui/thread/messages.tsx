import {
  CheckIcon,
  ChevronDown,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUp,
  CopyIcon,
  FileText,
  Loader2,
  PencilIcon,
  RefreshCwIcon,
} from "lucide-react";

import type { FC, MouseEvent, ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActionBarPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  useAuiState,
  useAui,
  useMessagePartText,
} from "@assistant-ui/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AssistantLoader } from "@/components/assistant-ui/assistant-loader";
import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from "@/components/assistant-ui/attachment";
import { File as FileComponent } from "@/components/assistant-ui/file";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { Reasoning, ReasoningGroup } from "@/components/assistant-ui/reasoning";
import { Sources } from "@/components/assistant-ui/sources";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { ToolGroup } from "@/components/assistant-ui/tool-group";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { Image } from "@/components/assistant-ui/image";
import { MessageContextBadges } from "@/components/chat/MessageContextBadges";
import { useCreateCardFromMessage } from "@/hooks/ai/use-create-card-from-message";
import { useAttachmentUploadStore } from "@/lib/stores/attachment-upload-store";
import { cn } from "@/lib/utils";

import { USER_MESSAGE_MAX_CHARS } from "./shared";

const UserMessageTruncateContext = createContext<{
  expanded: boolean;
  maxChars: number;
  showExpand: boolean;
} | null>(null);

type AssistantPart = {
  type?: string;
};

type MessagePartGroup = {
  groupKey: string | undefined;
  indices: number[];
};

const groupAssistantParts = (parts: readonly AssistantPart[]): MessagePartGroup[] => {
  const groups: MessagePartGroup[] = [];

  for (let index = 0; index < parts.length; index++) {
    const partType = parts[index]?.type;

    if (partType === "reasoning" || partType === "tool-call") {
      const startIndex = index;
      while (index + 1 < parts.length && parts[index + 1]?.type === partType) {
        index++;
      }

      groups.push({
        groupKey: `${partType}:${startIndex}-${index}`,
        indices: Array.from(
          { length: index - startIndex + 1 },
          (_, offset) => startIndex + offset,
        ),
      });
      continue;
    }

    groups.push({
      groupKey: undefined,
      indices: [index],
    });
  }

  return groups;
};

export const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root asChild>
      <div
        className="aui-assistant-message-root relative mx-auto w-full max-w-[var(--thread-max-width)] animate-in pb-4 duration-150 ease-out fade-in slide-in-from-bottom-1 last:mb-4"
        data-role="assistant"
      >
        <div className="aui-assistant-message-content mx-2 break-words leading-7 text-foreground">
          <AssistantLoader />
          <MessagePrimitive.Unstable_PartsGrouped
            groupingFunction={groupAssistantParts}
            components={{
              Text: MarkdownText,
              File: FileComponent,
              Source: Sources,
              Image,
              Reasoning,
              tools: {
                Fallback: ToolFallback,
              },
              Group: AssistantPartGroup,
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
  );
};

export const UserMessage: FC = () => {
  const [expanded, setExpanded] = useState(false);
  const message = useAuiState((s) => s.message);

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
      expanded,
      maxChars: USER_MESSAGE_MAX_CHARS,
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
        <UserMessageAttachments />

        <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
          <MessageContextBadges />
          <UserMessageTruncateContext.Provider value={truncateCtxValue}>
            <div className="aui-user-message-content relative rounded-lg bg-muted px-3 py-2 break-words text-sm text-foreground">
              <MessagePrimitive.Parts>
                {({ part }) => {
                  if (part.type === "text") {
                    return <UserMessageText />;
                  }

                  if (part.type === "file") {
                    return <FileComponent {...part} />;
                  }

                  return null;
                }}
              </MessagePrimitive.Parts>
              {showExpand ? (
                <div className="mt-1.5 flex justify-end pt-1.5">
                  <button
                    type="button"
                    onClick={() => setExpanded((value) => !value)}
                    className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
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
              ) : null}
            </div>
          </UserMessageTruncateContext.Provider>
        </div>

        <div className="aui-user-message-footer relative col-start-2 ml-2 flex min-h-[20px] justify-end">
          <div className="absolute right-0">
            <UserActionBar />
          </div>
        </div>

        <BranchPicker className="aui-user-branch-picker col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
      </div>
    </MessagePrimitive.Root>
  );
};

export const EditComposer: FC = () => {
  const aui = useAui();
  const hasUploading = useAttachmentUploadStore((state) => state.uploadingIds.size > 0);
  const [originalText] = useState(() => aui?.composer()?.getState()?.text ?? "");
  const [currentText, setCurrentText] = useState(() => originalText);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, []);

  const guardEditSend = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      if (useAttachmentUploadStore.getState().uploadingIds.size > 0) {
        e.preventDefault();
        toast.info("Please wait for uploads to finish before sending");
      }
    },
    [],
  );

  return (
    <div className="aui-edit-composer-wrapper mx-auto mb-4 flex w-full max-w-[var(--thread-max-width)] flex-col gap-4 px-2 first:mt-4">
      <ComposerPrimitive.Root
        className="aui-edit-composer-root ml-auto flex w-full max-w-7/8 flex-col rounded-xl border border-sidebar-border bg-sidebar-accent"
        onSubmit={(e) => {
          if (useAttachmentUploadStore.getState().uploadingIds.size > 0) {
            e.preventDefault();
            toast.info("Please wait for uploads to finish before sending");
          }
        }}
      >
        <ComposerAttachments />

        <ComposerPrimitive.Input
          ref={inputRef}
          className="aui-edit-composer-input flex min-h-[60px] w-full resize-none bg-transparent p-4 text-sidebar-foreground outline-none"
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
            <ComposerPrimitive.Send asChild>
              <Button
                size="sm"
                aria-label="Update message"
                disabled={currentText === originalText || hasUploading}
                onClick={guardEditSend}
                className={cn(
                  (currentText === originalText || hasUploading) &&
                    "cursor-not-allowed opacity-50",
                )}
              >
                {hasUploading ? (
                  <>
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  "Update"
                )}
              </Button>
            </ComposerPrimitive.Send>
          </div>
        </div>
      </ComposerPrimitive.Root>
    </div>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root mt-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive dark:bg-destructive/5 dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const AssistantActionBar: FC = () => {
  const { createCard, isCreating } = useCreateCardFromMessage({
    debounceMs: 300,
  });
  const content = useAuiState((s) => s.message.content);
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const textContent = useMemo(() => {
    const textParts = content.filter(
      (part): part is { type: "text"; text: string } => part.type === "text",
    );

    return textParts.map((part) => part.text ?? "").join("\n\n");
  }, [content]);

  const handleCopy = useCallback(() => {
    if (!textContent) return;

    navigator.clipboard.writeText(textContent);
    setCopied(true);
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }

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
      <Button
        variant="ghost"
        size="sm"
        onClick={createCard}
        disabled={isCreating}
        className="!px-1 gap-1 h-6 text-xs font-medium hover:bg-sidebar-accent"
      >
        <FileText className={cn("h-3 w-3", isCreating && "animate-pulse")} />
        <span>Save as Document</span>
      </Button>
    </ActionBarPrimitive.Root>
  );
};

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

const AssistantPartGroup: FC<{
  children?: ReactNode;
  groupKey: string | undefined;
  indices: number[];
}> = ({ children, indices }) => {
  const startIndex = indices[0] ?? 0;
  const endIndex = indices[indices.length - 1] ?? startIndex;
  const firstPartType = useAuiState(
    ({ message }) => message.parts[startIndex]?.type,
  );

  if (firstPartType === "reasoning") {
    return (
      <ReasoningGroup startIndex={startIndex} endIndex={endIndex}>
        {children}
      </ReasoningGroup>
    );
  }

  if (firstPartType === "tool-call") {
    return (
      <ToolGroup startIndex={startIndex} endIndex={endIndex}>
        {children}
      </ToolGroup>
    );
  }

  return <>{children}</>;
};

const UserActionBar: FC = () => {
  const message = useAuiState((s) => s.message);
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
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }

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
