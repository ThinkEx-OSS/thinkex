"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VList, type VListHandle } from "virtua";
import {
  ArrowUpIcon,
  Brain,
  CheckIcon,
  ChevronDown,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUp,
  CopyIcon,
  FileText,
  Loader2,
  Paperclip,
  Play,
  RefreshCwIcon,
  Search,
  Sparkles,
  Square,
} from "lucide-react";
import { PiCardsThreeBold } from "react-icons/pi";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import type { Item } from "@/lib/workspace-state/types";
import type { ReplySelection } from "@/lib/stores/ui-store";
import type { ThinkexUIMessage } from "@/lib/chat/types";
import { CHAT_TOOL, canonicalizeToolUIPartType } from "@/lib/ai/chat-tool-names";
import { useUIStore, selectReplySelections } from "@/lib/stores/ui-store";
import { useViewingItemIds } from "@/hooks/ui/use-viewing-item-ids";
import { useSelectedCardIds } from "@/hooks/ui/use-selected-card-ids";
import { formatSelectedCardsMetadata, formatWorkspaceContext } from "@/lib/utils/format-workspace-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { TooltipIconButton } from "@/components/chat-v2/ui/tooltip-icon-button";
import { AssistantLoader } from "@/components/chat-v2/ui/assistant-loader";
import { ModelPicker } from "@/components/chat-v2/composer/ModelPicker";
import { ModelSettingsMenu } from "@/components/chat-v2/composer/ModelSettingsMenu";
import { SpeechToTextButton } from "@/components/chat-v2/composer/SpeechToTextButton";
import {
  PromptBuilderDialog,
  type PromptBuilderAction,
} from "@/components/chat-v2/composer/PromptBuilderDialog";
import {
  AddYoutubeVideoToolUI,
  AttachmentTile,
  AttachmentTileCard,
  CreateDocumentToolUI,
  CreateFlashcardToolUI,
  CreateQuizToolUI,
  EditItemToolUI,
  ExecuteCodeToolUI,
  FilePart,
  ImagePart,
  MarkdownText,
  ReadWorkspaceToolUI,
  Reasoning,
  ReasoningGroup,
  SearchWorkspaceToolUI,
  Sources,
  ToolGroup,
  URLContextToolUI,
  WebSearchToolUI,
  YouTubeSearchToolUI,
} from "@/components/chat-v2";
import type { ToolUIProps } from "@/components/chat-v2/tools/types";
import { useAttachmentState } from "@/components/chat-v2/runtime/use-attachment-state";
import {
  ComposerProvider,
  type ComposerHandle,
} from "@/components/chat-v2/runtime/composer-context";
import { ThreadProvider } from "@/components/chat-v2/runtime/thread-context";
import { useBranching } from "@/components/chat-v2/runtime/use-branching";
import { useInitialMessages } from "@/components/chat-v2/runtime/use-initial-messages";
import { CardContextDisplay } from "@/components/chat/CardContextDisplay";
import { MentionMenu } from "@/components/chat/MentionMenu";
import { MessageContextBadges } from "@/components/chat/MessageContextBadges";
import { ReplyContextDisplay } from "@/components/chat/ReplyContextDisplay";
import AssistantTextSelectionManager from "@/components/chat-v2/AssistantTextSelectionManager";

const TOOL_COMPONENTS: Record<string, React.FC<ToolUIProps<any, any>>> = {
  [CHAT_TOOL.WORKSPACE_SEARCH]: SearchWorkspaceToolUI,
  [CHAT_TOOL.WORKSPACE_READ]: ReadWorkspaceToolUI,
  [CHAT_TOOL.YOUTUBE_ADD]: AddYoutubeVideoToolUI,
  [CHAT_TOOL.DOCUMENT_CREATE]: CreateDocumentToolUI,
  [CHAT_TOOL.FLASHCARDS_CREATE]: CreateFlashcardToolUI,
  [CHAT_TOOL.QUIZ_CREATE]: CreateQuizToolUI,
  [CHAT_TOOL.ITEM_EDIT]: EditItemToolUI,
  [CHAT_TOOL.CODE_EXECUTE]: ExecuteCodeToolUI,
  [CHAT_TOOL.WEB_FETCH]: URLContextToolUI,
  [CHAT_TOOL.WEB_SEARCH]: WebSearchToolUI,
  [CHAT_TOOL.YOUTUBE_SEARCH]: YouTubeSearchToolUI,
};

const WELCOME_ACTIONS: Array<{
  title: string;
  action: PromptBuilderAction;
  icon: React.ComponentType<{ className?: string }>;
  iconClassName: string;
}> = [
  {
    title: "Search",
    action: "search",
    icon: Search,
    iconClassName: "size-4 shrink-0 text-sky-500",
  },
  {
    title: "Flashcards",
    action: "flashcards",
    icon: PiCardsThreeBold,
    iconClassName: "size-4 shrink-0 text-purple-400 rotate-180",
  },
  {
    title: "YouTube",
    action: "youtube",
    icon: Play,
    iconClassName: "size-4 shrink-0 text-red-500",
  },
  {
    title: "Quiz",
    action: "quiz",
    icon: Brain,
    iconClassName: "size-4 shrink-0 text-green-400",
  },
  {
    title: "Document",
    action: "document",
    icon: FileText,
    iconClassName: "size-4 shrink-0 text-sky-400",
  },
];

function getMessageText(message: ThinkexUIMessage): string {
  return message.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n\n");
}

function getMessageReplySelections(message: ThinkexUIMessage): ReplySelection[] {
  const metadata = message.metadata as {
    custom?: { replySelections?: ReplySelection[] };
  } | undefined;
  return metadata?.custom?.replySelections ?? [];
}

function toAttachmentTileData(part: any, index: number) {
  const type =
    typeof part.mediaType === "string" && part.mediaType.startsWith("image/")
      ? "image"
      : part.mediaType === "application/pdf"
        ? "document"
        : "file";

  return {
    id: `${part.url}-${index}`,
    type,
    name: part.filename,
    content:
      type === "image"
        ? [{ type: "image", image: part.url }]
        : [],
  };
}

function getReasoningRuns(
  parts: ThinkexUIMessage["parts"],
): Array<{ start: number; end: number }> {
  const runs: Array<{ start: number; end: number }> = [];
  let start = -1;

  for (let index = 0; index < parts.length; index++) {
    if (parts[index]?.type === "reasoning") {
      if (start === -1) start = index;
      continue;
    }

    if (start !== -1) {
      runs.push({ start, end: index - 1 });
      start = -1;
    }
  }

  if (start !== -1) {
    runs.push({ start, end: parts.length - 1 });
  }

  return runs;
}

export function getToolRuns(
  parts: ThinkexUIMessage["parts"],
): Array<{ start: number; end: number }> {
  const runs: Array<{ start: number; end: number }> = [];
  let start = -1;

  for (let index = 0; index < parts.length; index++) {
    if (parts[index]?.type.startsWith("tool-")) {
      if (start === -1) start = index;
      continue;
    }

    if (start !== -1) {
      runs.push({ start, end: index - 1 });
      start = -1;
    }
  }

  if (start !== -1) {
    runs.push({ start, end: parts.length - 1 });
  }

  return runs;
}

function useComposerErrorToasts(error: Error | undefined) {
  useEffect(() => {
    if (!error) return;

    const errorMessage = error.message?.toLowerCase() || "";
    if (
      errorMessage.includes("timeout") ||
      errorMessage.includes("504") ||
      errorMessage.includes("gateway")
    ) {
      toast.error("Request timed out", {
        description: "The AI is taking too long to respond. Please try again.",
      });
      return;
    }

    if (
      errorMessage.includes("network") ||
      errorMessage.includes("fetch") ||
      errorMessage.includes("failed to fetch")
    ) {
      toast.error("Connection error", {
        description: "Unable to reach the server. Please check your connection.",
      });
      return;
    }

    toast.error("Something went wrong", {
      description: error.message || "An unexpected error occurred. Please try again.",
    });
  }, [error]);
}

export interface ThreadProps {
  threadId: string;
  workspaceId: string;
  items: Item[];
  workspaceName?: string;
  onComposerHandleChange?: (handle: ComposerHandle | null) => void;
}

export function Thread({
  threadId,
  workspaceId,
  items,
  workspaceName,
  onComposerHandleChange,
}: ThreadProps) {
  const { messages: initialMessages, headId, isLoading, tree } = useInitialMessages(threadId);
  const selectedModelId = useUIStore((state) => state.selectedModelId);
  const memoryEnabled = useUIStore((state) => state.memoryEnabled);
  const activeFolderId = useUIStore((state) => state.activeFolderId);
  const activePdfPageByItemId = useUIStore((state) => state.activePdfPageByItemId);
  const replySelections = useUIStore(useShallow(selectReplySelections));
  const clearReplySelections = useUIStore((state) => state.clearReplySelections);
  const { selectedCardIds } = useSelectedCardIds();
  const viewingItemIds = useViewingItemIds();

  const systemPrompt = useMemo(
    () => formatWorkspaceContext(items, workspaceName),
    [items, workspaceName],
  );

  const selectedCardsContext = useMemo(() => {
    const contextIds = new Set<string>(selectedCardIds);
    viewingItemIds.forEach((id) => contextIds.add(id));
    const contextItems = items.filter((item) => contextIds.has(item.id));
    if (contextItems.length === 0) return "";
    return formatSelectedCardsMetadata(
      contextItems,
      items,
      activePdfPageByItemId,
      viewingItemIds,
    );
  }, [activePdfPageByItemId, items, selectedCardIds, viewingItemIds]);

  const latestRequestRef = useRef({
    workspaceId,
    modelId: selectedModelId,
    memoryEnabled,
    activeFolderId,
    selectedCardsContext,
  });

  latestRequestRef.current = {
    workspaceId,
    modelId: selectedModelId,
    memoryEnabled,
    activeFolderId,
    selectedCardsContext,
  };

  const transport = useMemo(
    () =>
      new DefaultChatTransport<ThinkexUIMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest: async ({
          id,
          messages,
          trigger,
          messageId,
        }) => {
          const request = latestRequestRef.current;
          const lastMessage = messages[messages.length - 1];
          const replySelections =
            trigger === "submit-message" && lastMessage?.role === "user"
              ? getMessageReplySelections(lastMessage)
              : [];

          return {
            body: {
              id,
              trigger:
                trigger === "submit-message"
                  ? "submit-user-message"
                  : "regenerate-assistant-message",
              messages,
              messageId,
              parentId:
                trigger === "submit-message"
                  ? messages[messages.length - 2]?.id ?? null
                  : null,
              system: systemPrompt,
              workspaceId: request.workspaceId,
              modelId: request.modelId,
              memoryEnabled: request.memoryEnabled,
              activeFolderId: request.activeFolderId,
              selectedCardsContext: request.selectedCardsContext,
              metadata: {
                custom: {
                  replySelections,
                },
              },
            },
          };
        },
      }),
    [systemPrompt],
  );

  const {
    messages,
    sendMessage,
    regenerate,
    stop,
    status,
    error,
    setMessages,
  } = useChat<ThinkexUIMessage>({
    id: threadId,
    transport,
    messages: initialMessages,
    experimental_throttle: 50,
  });

  useComposerErrorToasts(error);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages, setMessages]);

  const branching = useBranching({
    threadId,
    initialTree: tree,
    initialHeadId: headId,
    messages,
    setMessages,
  });

  const vlistRef = useRef<VListHandle>(null);
  const [blankSize, setBlankSize] = useState(0);
  const [lastUserSize, setLastUserSize] = useState(0);

  const handleSubmit = useCallback(
    async (text: string, files: ReturnType<typeof useAttachmentState>["files"]) => {
      const handle = vlistRef.current;
      const lastIndex = messages.length - 1;
      if (handle) {
        setBlankSize(handle.viewportSize);
      }

      const metadata =
        replySelections.length > 0
          ? {
              custom: {
                replySelections,
              },
            }
          : {};

      await sendMessage({
        text,
        files,
        metadata,
      });
      clearReplySelections();

      requestAnimationFrame(() => {
        handle?.scrollToIndex(lastIndex + 1, { smooth: true, align: "start" });
      });
    },
    [clearReplySelections, messages.length, replySelections, sendMessage],
  );

  const composerStateRef = useRef<{
    setText: ((text: string) => void) | null;
    appendText: ((text: string) => void) | null;
    addAttachment: ((file: File) => Promise<void>) | null;
    focus: (() => void) | null;
    send: (() => void) | null;
    getText: (() => string) | null;
  }>({
    setText: null,
    appendText: null,
    addAttachment: null,
    focus: null,
    send: null,
    getText: null,
  });

  const composerHandle = useMemo<ComposerHandle>(
    () => ({
      setText(text) {
        composerStateRef.current.setText?.(text);
      },
      appendText(text) {
        composerStateRef.current.appendText?.(text);
      },
      addAttachment(file) {
        return composerStateRef.current.addAttachment?.(file) ?? Promise.resolve();
      },
      focus() {
        composerStateRef.current.focus?.();
      },
      send() {
        composerStateRef.current.send?.();
      },
      getText() {
        return composerStateRef.current.getText?.() ?? "";
      },
    }),
    [],
  );

  useEffect(() => {
    onComposerHandleChange?.(composerHandle);
    return () => {
      onComposerHandleChange?.(null);
    };
  }, [composerHandle, onComposerHandleChange]);

  return (
    <ThreadProvider value={{ threadId, messages }}>
      <ComposerProvider value={composerHandle}>
        <div className="relative flex h-full flex-col bg-sidebar">
          <div className="flex-1 min-h-0 overflow-hidden">
            {isLoading ? (
              <ThreadLoadingSkeleton />
            ) : messages.length === 0 ? (
              <ThreadWelcome items={items} />
            ) : (
              <VList
                ref={vlistRef}
                className="chat-v2-thread-viewport relative h-full overflow-y-auto px-4"
              >
                {messages.map((message, index) => {
                  const isLast = index === messages.length - 1;
                  const blank =
                    isLast && status === "streaming"
                      ? Math.max(0, blankSize - lastUserSize)
                      : undefined;

                  if (message.role === "user") {
                    return (
                      <UserMessage
                        key={message.id}
                        message={message}
                        isLast={isLast}
                        branching={branching}
                        onEdit={async (newText) => {
                          const result = await branching.editUserMessage(
                            message.id,
                            newText,
                          );
                          await sendMessage({
                            text: newText,
                            metadata: result.message.metadata,
                            messageId: result.message.id,
                          });
                        }}
                        onMeasure={
                          index === messages.length - 2 ? setLastUserSize : undefined
                        }
                      />
                    );
                  }

                  return (
                    <AssistantMessage
                      key={message.id}
                      message={message}
                      threadId={threadId}
                      isLast={isLast}
                      isStreaming={isLast && status === "streaming"}
                      minHeight={blank}
                      branching={branching}
                      onRegenerate={() => regenerate({ messageId: message.id })}
                    />
                  );
                })}
              </VList>
            )}
          </div>

          <div className="mx-auto flex w-full max-w-[50rem] flex-shrink-0 flex-col gap-4 overflow-visible rounded-t-3xl bg-sidebar px-4 pb-3 md:pb-4">
            <Composer
              items={items}
              status={status}
              onSubmit={handleSubmit}
              onStop={stop}
              onRegenerate={() => regenerate()}
              composerStateRef={composerStateRef}
            />
          </div>
          <AssistantTextSelectionManager className="absolute inset-0 pointer-events-none" />
        </div>
      </ComposerProvider>
    </ThreadProvider>
  );
}

function ThreadLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading chat"
      className="mx-auto flex w-full max-w-[50rem] flex-col gap-6 px-6 py-8"
    >
      <div className="flex justify-end">
        <Skeleton className="h-12 w-48 rounded-lg" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full max-w-[90%] rounded" />
        <Skeleton className="h-4 w-full max-w-[70%] rounded" />
        <Skeleton className="h-4 w-32 rounded" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-10 w-64 rounded-lg" />
      </div>
    </div>
  );
}

function ThreadWelcome({ items }: { items: Item[] }) {
  const [dialogAction, setDialogAction] = useState<PromptBuilderAction | null>(null);

  return (
    <>
      <div className="mx-auto flex h-full w-full max-w-[50rem] flex-col justify-center px-4">
        <div className="grid w-full grid-cols-2 gap-2 pb-4 sm:grid-cols-3">
          {WELCOME_ACTIONS.map(({ title, action, icon: Icon, iconClassName }) => (
            <Button
              key={action}
              type="button"
              variant="ghost"
              className="h-auto w-full items-center justify-start gap-2 rounded-lg border border-sidebar-border px-5 py-4 text-left text-sm dark:hover:bg-accent/60"
              onClick={() => setDialogAction(action)}
            >
              <Icon className={iconClassName} />
              <span className="font-medium">{title}</span>
            </Button>
          ))}
        </div>
      </div>

      {dialogAction ? (
        <PromptBuilderDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialogAction(null);
          }}
          action={dialogAction}
          items={items}
        />
      ) : null}
    </>
  );
}

function useMeasuredSize(onMeasure?: (size: number) => void) {
  return useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !onMeasure) return;
      const observer = new ResizeObserver(() => {
        onMeasure(node.getBoundingClientRect().height);
      });
      onMeasure(node.getBoundingClientRect().height);
      observer.observe(node);
      return () => observer.disconnect();
    },
    [onMeasure],
  );
}

function UserMessage({
  message,
  isLast,
  branching,
  onEdit,
  onMeasure,
}: {
  message: ThinkexUIMessage;
  isLast: boolean;
  branching: ReturnType<typeof useBranching>;
  onEdit: (newText: string) => Promise<void>;
  onMeasure?: (size: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(getMessageText(message));
  const measureRef = useMeasuredSize(onMeasure);
  const textContent = getMessageText(message);
  const attachments = message.parts
    .filter((part): part is any => part.type === "file")
    .map(toAttachmentTileData);
  const showExpand = textContent.length > 250;
  const visibleText =
    !expanded && showExpand ? `${textContent.slice(0, 250).trim()}...` : textContent;
  const siblingIds = branching.siblings(message.id);
  const siblingIndex = siblingIds.indexOf(message.id);

  const handleCopy = useCallback(async () => {
    if (!textContent) return;
    await navigator.clipboard.writeText(textContent);
    toast.success("Copied");
  }, [textContent]);

  return (
    <div
      ref={measureRef}
      className="mx-auto grid w-full max-w-[50rem] grid-cols-[minmax(72px,1fr)_auto] gap-y-2 px-2 pt-4 pb-1 last:mb-5 [&:where(>*)]:col-start-2"
      data-role="user"
    >
      {attachments.length > 0 ? (
        <div className="col-start-2 mb-2 flex flex-wrap justify-end gap-2">
          {attachments.map((attachment) => (
            <AttachmentTile
              key={attachment.id}
              attachment={attachment}
              source="message"
            />
          ))}
        </div>
      ) : null}

      <div className="relative col-start-2 min-w-0">
        <MessageContextBadges message={message} />
        {isEditing ? (
          <div className="flex w-full max-w-[85%] flex-col gap-3 rounded-xl border border-sidebar-border bg-sidebar-accent p-3 ml-auto">
            <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} />
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  await onEdit(draft);
                  setIsEditing(false);
                }}
              >
                Update
              </Button>
            </div>
          </div>
        ) : (
          <div className="ml-auto max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
            <div className="whitespace-pre-wrap break-words">{visibleText}</div>
            {showExpand ? (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setExpanded((value) => !value)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
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
        )}
      </div>

      <div className="col-start-2 flex min-h-[20px] justify-end">
        <div className="flex items-center gap-1 text-muted-foreground">
          <BranchPicker
            siblingIds={siblingIds}
            siblingIndex={siblingIndex}
            onSelect={(nextId) => branching.setHead(nextId)}
            align="end"
          />
          {!isEditing ? (
            <>
              <TooltipIconButton tooltip="Copy" onClick={() => void handleCopy()}>
                <CopyIcon />
              </TooltipIconButton>
              <TooltipIconButton tooltip="Edit" onClick={() => setIsEditing(true)}>
                <RefreshCwIcon />
              </TooltipIconButton>
            </>
          ) : null}
        </div>
      </div>

      {isLast ? <div className="h-1" /> : null}
    </div>
  );
}

function AssistantMessage({
  message,
  threadId,
  isLast,
  isStreaming,
  minHeight,
  branching,
  onRegenerate,
}: {
  message: ThinkexUIMessage;
  threadId: string;
  isLast: boolean;
  isStreaming: boolean;
  minHeight?: number;
  branching: ReturnType<typeof useBranching>;
  onRegenerate: () => void;
}) {
  const textContent = getMessageText(message);
  const siblingIds = branching.siblings(message.id);
  const siblingIndex = siblingIds.indexOf(message.id);

  const handleCopy = useCallback(async () => {
    if (!textContent) return;
    await navigator.clipboard.writeText(textContent);
    toast.success("Copied");
  }, [textContent]);

  return (
    <div
      className="relative mx-auto w-full max-w-[50rem] pb-4 last:mb-4"
      data-role="assistant"
      style={minHeight != null ? { minHeight } : undefined}
    >
      <div className="mx-2 break-words text-foreground">
        <AssistantLoader
          isRunning={isStreaming}
          isMessageEmpty={message.parts.length === 0}
        />
        <AssistantParts
          message={message}
          threadId={threadId}
          isLast={isLast}
          isStreaming={isStreaming}
        />
      </div>

      <div className="mt-2 ml-2 flex items-center gap-1 text-muted-foreground">
        <BranchPicker
          siblingIds={siblingIds}
          siblingIndex={siblingIndex}
          onSelect={(nextId) => branching.setHead(nextId)}
        />
        <TooltipIconButton tooltip="Copy" onClick={() => void handleCopy()}>
          <CopyIcon />
        </TooltipIconButton>
        <TooltipIconButton tooltip="Refresh" onClick={onRegenerate}>
          <RefreshCwIcon />
        </TooltipIconButton>
      </div>
    </div>
  );
}

function AssistantParts({
  message,
  threadId,
  isLast,
  isStreaming,
}: {
  message: ThinkexUIMessage;
  threadId: string;
  isLast: boolean;
  isStreaming: boolean;
}) {
  const reasoningRuns = getReasoningRuns(message.parts);
  const toolRuns = getToolRuns(message.parts);
  const handledIndices = new Set<number>();
  const elements: React.ReactNode[] = [];

  for (const run of reasoningRuns) {
    for (let index = run.start; index <= run.end; index++) {
      handledIndices.add(index);
    }

    const text = message.parts
      .slice(run.start, run.end + 1)
      .map((part: any) => part.text ?? "")
      .join("\n\n");

    elements.push(
      <ReasoningGroup
        key={`${message.id}-reasoning-${run.start}`}
        isLast={isLast}
        streaming={isStreaming}
        reasoningLength={text.length}
      >
        <Reasoning
          text={text}
          streaming={isStreaming && isLast}
          messageKey={`${threadId}-${message.id}-reasoning-${run.start}`}
        />
      </ReasoningGroup>,
    );
  }

  for (const run of toolRuns) {
    for (let index = run.start; index <= run.end; index++) {
      handledIndices.add(index);
    }

    const children = message.parts
      .slice(run.start, run.end + 1)
      .map((part: any, partIndex) => (
        <ToolPartRenderer
          key={`${message.id}-tool-${run.start + partIndex}`}
          part={part}
        />
      ));

    elements.push(
      <ToolGroup
        key={`${message.id}-tool-group-${run.start}`}
        startIndex={run.start}
        endIndex={run.end}
        isLast={isLast}
        streaming={isStreaming}
      >
        {children}
      </ToolGroup>,
    );
  }

  message.parts.forEach((part: any, index) => {
    if (handledIndices.has(index)) return;

    if (part.type === "text") {
      elements.push(
        <MarkdownText
          key={`${message.id}-text-${index}`}
          text={part.text}
          streaming={isStreaming && isLast}
          messageKey={`${threadId}-${message.id}-${index}`}
        />,
      );
      return;
    }

    if (part.type === "file") {
      if (typeof part.mediaType === "string" && part.mediaType.startsWith("image/")) {
        elements.push(
          <ImagePart
            key={`${message.id}-image-${index}`}
            image={part.url}
            filename={part.filename}
          />,
        );
        return;
      }

      elements.push(
        <FilePart
          key={`${message.id}-file-${index}`}
          filename={part.filename}
          data={part.url}
          mimeType={part.mediaType}
        />,
      );
      return;
    }

    if (part.type === "source-url" || part.type === "source-document") {
      elements.push(
        <Sources
          key={`${message.id}-source-${index}`}
          url={part.url}
          title={part.title}
          sourceType={part.type === "source-url" ? "url" : "document"}
        />,
      );
    }
  });

  return <>{elements}</>;
}

function ToolPartRenderer({ part }: { part: any }) {
  const canonicalType = canonicalizeToolUIPartType(part.type);
  const toolName = canonicalType.slice("tool-".length);
  const Component = TOOL_COMPONENTS[toolName];

  if (!Component) {
    return null;
  }

  return (
    <Component
      toolCallId={part.toolCallId}
      state={part.state}
      input={part.input}
      output={part.output}
      errorText={part.errorText}
    />
  );
}

function BranchPicker({
  siblingIds,
  siblingIndex,
  onSelect,
  align = "start",
}: {
  siblingIds: string[];
  siblingIndex: number;
  onSelect: (messageId: string) => void;
  align?: "start" | "end";
}) {
  if (siblingIds.length <= 1 || siblingIndex === -1) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center text-xs text-muted-foreground",
        align === "end" && "justify-end",
      )}
    >
      <TooltipIconButton
        tooltip="Previous"
        onClick={() => onSelect(siblingIds[Math.max(0, siblingIndex - 1)]!)}
        disabled={siblingIndex === 0}
      >
        <ChevronLeftIcon />
      </TooltipIconButton>
      <span className="font-medium">
        {siblingIndex + 1} / {siblingIds.length}
      </span>
      <TooltipIconButton
        tooltip="Next"
        onClick={() =>
          onSelect(siblingIds[Math.min(siblingIds.length - 1, siblingIndex + 1)]!)
        }
        disabled={siblingIndex === siblingIds.length - 1}
      >
        <ChevronRightIcon />
      </TooltipIconButton>
    </div>
  );
}

function Composer({
  items,
  status,
  onSubmit,
  onStop,
  onRegenerate,
  composerStateRef,
}: {
  items: Item[];
  status: string;
  onSubmit: (
    text: string,
    files: ReturnType<typeof useAttachmentState>["files"],
  ) => Promise<void>;
  onStop: () => void;
  onRegenerate: () => void;
  composerStateRef: React.MutableRefObject<{
    setText: ((text: string) => void) | null;
    appendText: ((text: string) => void) | null;
    addAttachment: ((file: File) => Promise<void>) | null;
    focus: (() => void) | null;
    send: (() => void) | null;
    getText: (() => string) | null;
  }>;
}) {
  const attachmentState = useAttachmentState();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState("");
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [dialogAction, setDialogAction] = useState<PromptBuilderAction | null>(null);
  const toggleCardSelection = useUIStore((state) => state.toggleCardSelection);
  const replySelections = useUIStore(useShallow(selectReplySelections));
  const { selectedCardIds } = useSelectedCardIds();

  const submit = useCallback(async () => {
    if (attachmentState.uploading) {
      toast.info("Please wait for uploads to finish before sending");
      return;
    }

    if (!text.trim() && attachmentState.files.length === 0 && replySelections.length === 0) {
      return;
    }

    const outgoingText = text.trim() || (replySelections.length > 0 ? "Empty message" : "");
    await onSubmit(outgoingText, attachmentState.files);
    setText("");
    attachmentState.clear();
    setMentionMenuOpen(false);
    setMentionQuery("");
    setMentionStartIndex(null);
  }, [attachmentState, onSubmit, replySelections.length, text]);

  const focus = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const appendText = useCallback((value: string) => {
    setText((current) => current + value);
  }, []);

  useEffect(() => {
    composerStateRef.current = {
      setText,
      appendText,
      addAttachment: attachmentState.addFile,
      focus,
      send: () => {
        void submit();
      },
      getText: () => text,
    };
  }, [appendText, attachmentState.addFile, composerStateRef, focus, submit, text]);

  const clearMentionQuery = useCallback(() => {
    if (mentionStartIndex == null || !inputRef.current) return;
    const currentValue = inputRef.current.value;
    const atIndex = mentionStartIndex;
    let queryEndIndex = mentionStartIndex;
    while (
      queryEndIndex < currentValue.length &&
      currentValue[queryEndIndex] !== " " &&
      currentValue[queryEndIndex] !== "\n"
    ) {
      queryEndIndex++;
    }

    const nextValue =
      currentValue.substring(0, atIndex) + currentValue.substring(queryEndIndex);
    setText(nextValue);
    setMentionQuery("");
    setMentionStartIndex(null);

    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(atIndex, atIndex);
    }, 0);
  }, [mentionStartIndex]);

  return (
    <>
      <div className="relative flex w-full flex-col rounded-lg border border-sidebar-border bg-sidebar-accent px-3.5 pt-2 pb-1 shadow-[0_9px_9px_0px_rgba(0,0,0,0.01),0_2px_5px_0px_rgba(0,0,0,0.06)] dark:border-sidebar-border/15">
        {attachmentState.attachments.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachmentState.attachments.map((attachment) => (
              <AttachmentTileCard
                key={attachment.id}
                attachment={attachment}
                source="composer"
                uploading={attachmentState.uploading && !attachmentState.files.some((file) => file.filename === attachment.name)}
                removable
                onRemove={() => attachmentState.remove(attachment.id)}
              />
            ))}
          </div>
        ) : null}

        <CardContextDisplay items={items} />
        <ReplyContextDisplay />

        <div className="relative">
          <Textarea
            ref={inputRef}
            placeholder="Ask anything or @mention items"
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="chat-v2-composer-input max-h-32 min-h-[44px] w-full resize-none border-0 bg-transparent px-0 py-1.5 text-base text-sidebar-foreground shadow-none outline-none placeholder:text-sidebar-foreground/60 focus-visible:ring-0"
            rows={1}
            aria-label="Message input"
            maxLength={10000}
            onPaste={async (event) => {
              const files = Array.from(event.clipboardData.files);
              if (files.length > 0) {
                event.preventDefault();
                await attachmentState.addFile(files[0]!);
                return;
              }

              const imageItem = Array.from(event.clipboardData.items).find((item) =>
                item.type.startsWith("image/"),
              );
              if (!imageItem) return;
              const file = imageItem.getAsFile();
              if (!file) return;
              event.preventDefault();
              await attachmentState.addFile(file);
            }}
            onKeyDown={(event) => {
              if (event.key === "@" && !mentionMenuOpen) {
                const cursorPos = event.currentTarget.selectionStart ?? 0;
                const charBefore =
                  cursorPos > 0 ? event.currentTarget.value[cursorPos - 1] : " ";
                if (charBefore === " " || charBefore === "\n" || cursorPos === 0) {
                  setMentionMenuOpen(true);
                  setMentionStartIndex(cursorPos);
                  setMentionQuery("");
                }
              }

              if (event.key === "Escape" && mentionMenuOpen) {
                event.preventDefault();
                setMentionMenuOpen(false);
                setMentionStartIndex(null);
                setMentionQuery("");
              }

              if (event.key === "Enter" && !event.shiftKey && !mentionMenuOpen) {
                event.preventDefault();
                void submit();
              }
            }}
            onInput={(event) => {
              const textarea = event.currentTarget;
              const cursorPos = textarea.selectionStart ?? 0;
              if (mentionStartIndex == null) return;
              const query = textarea.value.slice(mentionStartIndex + 1, cursorPos);
              if (
                cursorPos <= mentionStartIndex ||
                query.includes(" ") ||
                query.includes("\n")
              ) {
                setMentionMenuOpen(false);
                setMentionStartIndex(null);
                setMentionQuery("");
                return;
              }
              setMentionQuery(query);
            }}
          />

          <MentionMenu
            open={mentionMenuOpen}
            onOpenChange={(open) => {
              if (!open) clearMentionQuery();
              setMentionMenuOpen(open);
            }}
            query={mentionQuery}
            items={items}
            onSelect={(item) => toggleCardSelection(item.id)}
            selectedCardIds={selectedCardIds}
          />
        </div>

        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={async (event) => {
                const files = Array.from(event.target.files ?? []);
                await Promise.all(files.map((file) => attachmentState.addFile(file)));
                event.currentTarget.value = "";
              }}
            />

            <TooltipIconButton
              tooltip="Add attachment"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="size-4" />
            </TooltipIconButton>
            <ModelSettingsMenu />
            <ModelPicker />
            <SpeechToTextButton />
            <TooltipIconButton
              tooltip="Prompt builder"
              onClick={() => setDialogAction("document")}
            >
              <Sparkles className="size-4" />
            </TooltipIconButton>
          </div>

          <div className="flex items-center gap-2">
            {status === "ready" ? (
              <TooltipIconButton tooltip="Regenerate" onClick={onRegenerate}>
                <RefreshCwIcon className="size-4" />
              </TooltipIconButton>
            ) : null}

            {status === "streaming" || status === "submitted" ? (
              <Button
                type="button"
                variant="default"
                size="icon"
                className="size-[34px] rounded-full border border-muted-foreground/60 hover:bg-primary/75 dark:border-muted-foreground/90"
                onClick={onStop}
              >
                <Square className="size-3 fill-current text-background" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                className="size-[34px] rounded-full"
                disabled={attachmentState.uploading}
                onClick={() => void submit()}
              >
                {attachmentState.uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowUpIcon className="size-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {dialogAction ? (
        <PromptBuilderDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialogAction(null);
          }}
          action={dialogAction}
          items={items}
        />
      ) : null}
    </>
  );
}
