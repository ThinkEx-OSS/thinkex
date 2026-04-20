"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ReplySelectionRichText } from "@/components/chat/ReplySelectionRichText";
import { BranchNav } from "./BranchNav";
import { UserActionBar } from "./UserActionBar";
import type { ChatMessage } from "@/lib/chat-v2/types";
import { editBranchMessage } from "@/lib/chat-v2/branches";

const USER_MESSAGE_MAX_CHARS = 2500;

interface UserMessageProps {
  threadId?: string | null;
  message: ChatMessage;
  onReloadThread: () => Promise<void>;
  onRegenerate: (messageId: string) => Promise<void>;
}

function ReplyContextBadges({ message }: { message: ChatMessage }) {
  const replySelections = message.metadata?.replySelections;
  if (!replySelections?.length) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {replySelections.map((selection, index) => (
        <div key={`${message.id}-reply-${index}`} className="inline-flex items-center gap-1.5 rounded-md border border-blue-600/25 bg-blue-600/10 px-2 py-0.5 text-xs text-blue-800 dark:text-blue-200">
          <ReplySelectionRichText text={selection.text} />
        </div>
      ))}
    </div>
  );
}

export function UserMessage({ threadId, message, onReloadThread, onRegenerate }: UserMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => message.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n\n"));
  const textContent = useMemo(() => message.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n\n"), [message.parts]);
  const showExpand = textContent.length > USER_MESSAGE_MAX_CHARS;
  const visibleText = showExpand && !expanded ? `${textContent.slice(0, USER_MESSAGE_MAX_CHARS)}…` : textContent;
  const fileParts = message.parts.filter((part) => part.type === "file");

  const saveEdit = async () => {
    if (!threadId) return;
    try {
      const { newMessageId } = await editBranchMessage(threadId, message.id, draft);
      setEditing(false);
      await onReloadThread();
      await onRegenerate(newMessageId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to edit message");
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-[50rem] auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] gap-y-2 px-2 pt-4 pb-1 last:mb-5 [&:where(>*)]:col-start-2" data-role="user">
      {fileParts.length > 0 ? (
        <div className="col-start-2 flex flex-wrap justify-end gap-2">
          {fileParts.map((part) => (
            <a key={part.url} href={part.url} target="_blank" rel="noreferrer" className="rounded-md border bg-background px-2 py-1 text-xs text-foreground">
              {part.filename ?? part.url}
            </a>
          ))}
        </div>
      ) : null}

      <div className="relative col-start-2 min-w-0">
        <ReplyContextBadges message={message} />
        <div className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
          {editing ? (
            <div className="space-y-3">
              <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="min-h-28 resize-y bg-background" />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setDraft(textContent); }}>Cancel</Button>
                <Button size="sm" onClick={() => void saveEdit()}>Save</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="whitespace-pre-wrap break-words">{visibleText}</div>
              {showExpand ? (
                <div className="mt-2 flex justify-end">
                  <button type="button" onClick={() => setExpanded((value) => !value)} className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
                    {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    {expanded ? "Show less" : "Show more"}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="relative col-start-2 min-h-[20px]">
        {!editing ? <div className="absolute right-0"><UserActionBar textContent={textContent} onEdit={() => setEditing(true)} /></div> : null}
      </div>

      <BranchNav threadId={threadId} messageId={message.id} className="col-span-full col-start-1 justify-end text-xs text-muted-foreground" />
    </div>
  );
}
