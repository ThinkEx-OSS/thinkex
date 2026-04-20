"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect, useRef, type FC } from "react";
import {
  PromptInputAttachments,
} from "@/components/assistant-ui/attachment";
import { CardContextDisplay } from "@/components/chat/CardContextDisplay";
import { MentionMenu } from "@/components/chat/MentionMenu";
import { ReplyContextDisplay } from "@/components/chat/ReplyContextDisplay";
import { ChatPromptInput, useMainThreadId, usePromptInput } from "@/lib/chat/runtime";
import { useAttachmentUploadStore } from "@/lib/stores/attachment-upload-store";
import { selectReplySelections, useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { isOfficeDocument } from "@/lib/uploads/office-document-validation";
import { processPdfAttachmentsInBackground } from "@/lib/uploads/process-pdf-attachments-in-background";
import type { Item } from "@/lib/workspace-state/types";
import { useSelectedCardIds } from "@/hooks/ui/use-selected-card-ids";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { PromptInputToolbar } from "./PromptInputToolbar";
import { useMentionMenu } from "./hooks/use-mention-menu";
import { usePromptInputPaste } from "./hooks/use-prompt-input-paste";

interface PromptInputProps {
  items: Item[];
}

export const PromptInput: FC<PromptInputProps> = ({ items }) => {
  const currentWorkspaceId = useWorkspaceStore(
    (state) => state.currentWorkspaceId,
  );
  const promptInput = usePromptInput();
  const replySelections = useUIStore(useShallow(selectReplySelections));
  const clearReplySelections = useUIStore(
    (state) => state.clearReplySelections,
  );
  const { selectedCardIds } = useSelectedCardIds();
  const { state: workspaceState } = useWorkspaceState(currentWorkspaceId);
  const operations = useWorkspaceOperations(currentWorkspaceId, workspaceState);
  const mainThreadId = useMainThreadId();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const toggleCardSelection = useUIStore((state) => state.toggleCardSelection);
  const mention = useMentionMenu({
    inputRef,
    promptInput,
    onSelectItem: (item) => toggleCardSelection(item.id),
  });
  const handlePaste = usePromptInputPaste({
    promptInput,
    workspaceId: currentWorkspaceId,
  });

  useEffect(() => {
    if (mainThreadId && inputRef.current) {
      const timeoutId = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [mainThreadId]);

  return (
    <ChatPromptInput.Root
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

        const composerState = promptInput?.getState();
        if (!composerState) return;

        const currentText = composerState.text;
        const attachments = composerState.attachments || [];
        const hasReplyContext = replySelections.length > 0;
        if (!currentText.trim() && attachments.length === 0 && !hasReplyContext) {
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
          void processPdfAttachmentsInBackground(
            pdfAttachments,
            currentWorkspaceId,
            operations,
          );
        }

        const modifiedText =
          currentText.trim() || (hasReplyContext ? "Empty message" : "");

        const customMetadata: Record<string, unknown> = {};
        if (replySelections.length > 0) {
          customMetadata.replySelections = replySelections;
        }
        promptInput?.setRunConfig(
          Object.keys(customMetadata).length > 0 ? { custom: customMetadata } : {},
        );

        promptInput?.setText(modifiedText);
        promptInput?.send();
        clearReplySelections();
      }}
    >
      <PromptInputAttachments />
      <CardContextDisplay items={items} />
      <ReplyContextDisplay />
      <div className="relative">
        <ChatPromptInput.Input
          ref={inputRef}
          placeholder="Ask anything or @mention items"
          className="aui-composer-input max-h-32 w-full resize-none bg-transparent py-1.5 text-base text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/60 focus:outline-none"
          rows={1}
          autoFocus
          aria-label="Message input"
          maxLength={10000}
          cancelOnEscape={false}
          onPaste={handlePaste}
          onKeyDown={mention.handleKeyDown}
          onInput={mention.handleInput}
        />
        <MentionMenu
          open={mention.mentionMenuOpen}
          onOpenChange={mention.handleMentionMenuClose}
          query={mention.mentionQuery}
          items={items}
          onSelect={mention.handleMentionSelect}
          selectedCardIds={selectedCardIds}
          selectedIndicator={(isSelected) =>
            isSelected ? (
              <CheckCircle2 className="size-4 text-primary flex-shrink-0" />
            ) : undefined
          }
        />
      </div>
      <PromptInputToolbar />
    </ChatPromptInput.Root>
  );
};
