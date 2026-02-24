"use client";

import { memo } from "react";
import { useAuiState } from "@assistant-ui/react";
import { MdFormatColorText } from "react-icons/md";
import { BsArrowReturnRight } from "react-icons/bs";

type BlockNoteSelectionMeta = {
  cardId: string;
  cardName: string;
  text: string;
};

type ReplySelectionMeta = {
  text: string;
  messageContext?: string;
  userPrompt?: string;
};

type MessageCustomMetadata = {
  blockNoteSelection?: BlockNoteSelectionMeta;
  replySelections?: ReplySelectionMeta[];
};

const truncate = (text: string, max: number) =>
  text.length <= max ? text : text.slice(0, max).trim() + "...";

/**
 * Renders persisted context badges (BlockNote selection, reply)
 * from message.metadata.custom when viewing user messages in history.
 */
function MessageContextBadgesImpl() {
  const message = useAuiState((s) => s.message);
  if (!message || message.role !== "user") return null;

  const custom = (message.metadata as { custom?: MessageCustomMetadata } | undefined)?.custom;
  if (!custom) return null;

  const { blockNoteSelection, replySelections } = custom;
  const hasAny = blockNoteSelection || (replySelections && replySelections.length > 0);
  if (!hasAny) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {blockNoteSelection && (
        <div
          className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5"
          title={blockNoteSelection.text}
        >
          <MdFormatColorText className="h-3.5 w-3.5 shrink-0 text-primary/70" />
          <span className="text-xs text-primary/90">
            From "{blockNoteSelection.cardName}": {truncate(blockNoteSelection.text, 40)}
          </span>
        </div>
      )}
      {replySelections?.map((sel, i) => (
        <div
          key={i}
          className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-0.5"
          title={sel.text}
        >
          <BsArrowReturnRight className="h-3.5 w-3.5 shrink-0 text-blue-500" />
          <span className="text-xs text-blue-700 dark:text-blue-300">
            {truncate(sel.text, 40)}
          </span>
        </div>
      ))}
    </div>
  );
}

export const MessageContextBadges = memo(MessageContextBadgesImpl);
