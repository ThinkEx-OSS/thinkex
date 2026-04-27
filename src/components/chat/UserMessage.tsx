"use client";

import {
  ArrowUpIcon,
  CheckIcon,
  ChevronDown,
  ChevronUp,
  CopyIcon,
  Loader2,
  PencilIcon,
} from "lucide-react";
import {
  memo,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type FC,
} from "react";

import { useChatContext } from "@/components/chat/ChatProvider";
import { MessagePart } from "@/components/chat/parts/MessagePart";
import { ReplySelectionBadges } from "@/components/chat/parts/ReplySelectionBadges";
import { TooltipIconButton } from "@/components/chat/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

// NOTE: editing replays through the SDK's native regenerate flow:
// `regenerate({ messageId })` fires `trigger=regenerate-message`, and the
// server's `/api/chat` route truncates persisted history at that message id
// before writing the replacement turn. No separate DELETE round-trip needed.

const USER_MESSAGE_MAX_CHARS = 800;

interface UserMessageProps {
  message: ChatMessage;
  /** True while the assistant is currently producing a response. */
  isAssistantStreaming: boolean;
  /** Only the latest user turn can be edited safely. */
  canEdit: boolean;
}

const UserMessageImpl: FC<UserMessageProps> = ({
  message,
  isAssistantStreaming,
  canEdit,
}) => {
  const { setMessages, regenerate } = useChatContext();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isEditing = editing && canEdit;

  const textContent = useMemo(() => {
    return message.parts
      .filter(
        (p): p is { type: "text"; text: string } =>
          p.type === "text" &&
          typeof (p as { text?: string }).text === "string",
      )
      .map((p) => p.text)
      .join("\n\n");
  }, [message.parts]);
  const fileParts = useMemo(() => {
    return message.parts.filter(
      (
        part,
      ): part is {
        type: "file";
        url: string;
        mediaType: string;
        filename?: string;
      } =>
        part.type === "file" &&
        typeof part.url === "string" &&
        typeof part.mediaType === "string",
    );
  }, [message.parts]);
  const nonFileParts = useMemo(() => {
    return message.parts.filter((part) => part.type !== "file");
  }, [message.parts]);

  const showExpand = textContent.length > USER_MESSAGE_MAX_CHARS;
  const canEditText = canEdit && textContent.trim().length > 0;
  const hasVisibleMessageBody = nonFileParts.length > 0;

  const handleCopy = useCallback(() => {
    if (!textContent) return;
    navigator.clipboard.writeText(textContent);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }, [textContent]);

  return (
    <div
      className="mx-auto grid w-full max-w-[var(--thread-max-width)] auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] gap-y-2 px-2 pt-4 pb-1 [&:where(>*)]:col-start-2"
      data-role="user"
    >
      <div
        className={cn(
          "relative min-w-0",
          isEditing
            ? "col-span-2 col-start-1 w-full"
            : "col-start-2 w-fit max-w-full justify-self-end",
        )}
      >
        <ReplySelectionBadges message={message} />
        {isEditing ? (
          <UserMessageEditor
            initialText={textContent}
            onCancel={() => setEditing(false)}
            onSubmit={async (newText) => {
              if (!canEdit) return;
              const idx = nextSetMessages(setMessages, message, newText);
              setEditing(false);
              if (idx >= 0) {
                // SDK-native regenerate. The server reads `trigger` +
                // `messageId` from the request body and truncates the
                // persisted thread at this message before writing the
                // replacement turn in `onFinish`.
                await regenerate({ messageId: message.id });
              }
            }}
          />
        ) : (
          <>
            {fileParts.length > 0 ? (
              <div className="mb-1 flex max-w-full flex-wrap justify-end gap-1.5">
                {fileParts.map((part, i) => (
                  <MessagePart
                    key={`${message.id}-file-${i}`}
                    part={part}
                    partIndex={i}
                    totalParts={fileParts.length}
                    message={message}
                    isStreaming={false}
                    messageKey={`${message.id}-file-${i}`}
                  />
                ))}
              </div>
            ) : null}
            {hasVisibleMessageBody ? (
              <div className="relative rounded-lg bg-muted px-3 py-2 break-words text-foreground text-sm">
                <div
                  className={cn(
                    "leading-6 [&>span]:whitespace-pre-wrap",
                    !expanded && showExpand && "line-clamp-[12]",
                  )}
                >
                  {nonFileParts.map((part, i) => (
                    <MessagePart
                      key={`${message.id}-body-${i}`}
                      part={part}
                      partIndex={i}
                      totalParts={nonFileParts.length}
                      message={message}
                      isStreaming={false}
                      messageKey={`${message.id}-body-${i}`}
                    />
                  ))}
                </div>
                {showExpand && (
                  <div className="mt-1.5 flex justify-end pt-1.5">
                    <button
                      type="button"
                      onClick={() => setExpanded((e) => !e)}
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
                )}
              </div>
            ) : null}
          </>
        )}
      </div>

      {!isEditing && (
        <div className="ml-2 flex justify-end col-start-2 relative min-h-[20px]">
          <div className="absolute right-0 flex gap-1 text-muted-foreground opacity-0 transition-opacity group-hover/message:opacity-100">
            {textContent ? (
              <TooltipIconButton tooltip="Copy" onClick={handleCopy}>
                {copied ? <CheckIcon /> : <CopyIcon />}
              </TooltipIconButton>
            ) : null}
            {canEditText ? (
              <TooltipIconButton
                tooltip="Edit"
                onClick={() => setEditing(true)}
                disabled={isAssistantStreaming}
              >
                <PencilIcon />
              </TooltipIconButton>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

interface UserMessageEditorProps {
  initialText: string;
  onCancel: () => void;
  onSubmit: (text: string) => Promise<void> | void;
}

function UserMessageEditor({
  initialText,
  onCancel,
  onSubmit,
}: UserMessageEditorProps) {
  const [value, setValue] = useState(initialText);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, []);

  const handleSubmit = useCallback(async () => {
    const text = value.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    void Promise.resolve(onSubmit(text)).finally(() => {
      setSubmitting(false);
    });
  }, [value, submitting, onSubmit]);

  return (
    <form
      className="relative flex w-full min-w-0 flex-col rounded-lg border border-sidebar-border bg-sidebar-accent px-3.5 pt-2 pb-2 shadow-[0_9px_9px_0px_rgba(0,0,0,0.01),0_2px_5px_0px_rgba(0,0,0,0.06)] dark:border-sidebar-border/15"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        rows={1}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void handleSubmit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className="max-h-32 w-full resize-none bg-transparent py-1.5 text-base text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/60 focus:outline-none"
      />
      <div className="relative mt-2 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="icon"
          className="size-[34px] shrink-0 rounded-full p-1"
          aria-label="Save and resend message"
          disabled={!value.trim() || submitting}
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowUpIcon className="size-4" />
          )}
        </Button>
      </div>
    </form>
  );
}

/**
 * Hard-truncate the local message list at the edited user turn (replacing its
 * text and dropping every later message), then return its index. The caller
 * follows up with `regenerate({ messageId })`; the server mirrors the
 * truncation in its `onFinish` handler when `trigger=regenerate-message`.
 */
function nextSetMessages(
  setMessages: ReturnType<typeof useChatContext>["setMessages"],
  message: ChatMessage,
  newText: string,
): number {
  let editedIndex = -1;
  setMessages((prev) => {
    const idx = prev.findIndex((m) => m.id === message.id);
    if (idx < 0) return prev;
    editedIndex = idx;
    const head = prev.slice(0, idx);
    const preservedParts = prev[idx].parts.filter(
      (part) => part.type !== "text",
    );
    const edited: ChatMessage = {
      ...prev[idx],
      parts: [{ type: "text", text: newText }, ...preservedParts],
    };
    return [...head, edited];
  });
  return editedIndex;
}

export const UserMessage = memo(UserMessageImpl);
