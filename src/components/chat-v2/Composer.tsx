"use client";

import { CheckCircle2, X } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";
import { CardContextDisplay } from "@/components/chat/CardContextDisplay";
import { ReplyContextDisplay } from "@/components/chat/ReplyContextDisplay";
import { MentionMenu } from "@/components/chat/MentionMenu";
import { useSelectedCardIds } from "@/hooks/ui/use-selected-card-ids";
import { useUIStore } from "@/lib/stores/ui-store";
import { useAttachmentUploadStore } from "@/lib/stores/attachment-upload-store";
import { uploadFileDirect } from "@/lib/uploads/client-upload";
import { filterPasswordProtectedPdfs } from "@/lib/uploads/pdf-validation";
import { emitPasswordProtectedPdf } from "@/components/modals/PasswordProtectedPdfDialog";
import { useChatRuntime, type ComposerAttachment } from "@/lib/chat-v2/use-chat-runtime";
import { useMentionMenu } from "./hooks/use-mention-menu";
import { usePromptInputPaste } from "./hooks/use-prompt-input-paste";
import { ComposerToolbar } from "./ComposerToolbar";
import { useShallow } from "zustand/react/shallow";

export function Composer() {
  const {
    items,
    input,
    setInput,
    attachments,
    setAttachments,
    composerRef,
    sendMessage,
    status,
    stop,
    focusComposer,
  } = useChatRuntime();
  const toggleCardSelection = useUIStore((state) => state.toggleCardSelection);
  const replySelections = useUIStore(useShallow((state) => state.replySelections));
  const { selectedCardIds } = useSelectedCardIds();

  const addFiles = useCallback(async (files: File[]) => {
    const pdfFiles = files.filter(
      (file) =>
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"),
    );
    const { rejected: protectedNames } = await filterPasswordProtectedPdfs(pdfFiles);

    if (protectedNames.length > 0) {
      emitPasswordProtectedPdf(protectedNames);
    }

    const protectedSet = new Set(protectedNames);
    const allowedFiles = files.filter((file) => !protectedSet.has(file.name));
    if (allowedFiles.length === 0) return;

    const nextAttachments: ComposerAttachment[] = allowedFiles.map((file) => {
      const id = crypto.randomUUID();
      useAttachmentUploadStore.getState().addUploading(id);
      const attachment: ComposerAttachment = {
        id,
        file,
        filename: file.name,
        mediaType: file.type || "application/octet-stream",
        isUploading: true,
      };
      attachment.uploadPromise = uploadFileDirect(file)
        .then((result) => {
          setAttachments((current) =>
            current.map((candidate) =>
              candidate.id === id
                ? {
                    ...candidate,
                    url: result.url,
                    filename: result.displayName,
                    mediaType: result.contentType,
                    isUploading: false,
                  }
                : candidate,
            ),
          );
        })
        .catch(() => {
          toast.error(`Failed to upload ${file.name}`);
          setAttachments((current) =>
            current.filter((candidate) => candidate.id !== id),
          );
        })
        .finally(() => {
          useAttachmentUploadStore.getState().removeUploading(id);
        });
      return attachment;
    });

    setAttachments((current) => [...current, ...nextAttachments]);
  }, [setAttachments]);

  const mention = useMentionMenu({
    inputRef: composerRef,
    setInput,
    onSelectItem: (item) => toggleCardSelection(item.id),
  });

  const handlePaste = usePromptInputPaste({ addFiles });

  const handleSend = useCallback(async () => {
    if (useAttachmentUploadStore.getState().uploadingIds.size > 0) {
      toast.info("Please wait for uploads to finish before sending");
      return;
    }

    await Promise.all(attachments.map((attachment) => attachment.uploadPromise).filter(Boolean));

    const text = input.trim();
    if (!text && attachments.length === 0 && replySelections.length === 0) {
      return;
    }

    await sendMessage({
      role: "user",
      parts: [
        ...attachments.filter((attachment) => attachment.url).map((attachment) => ({
          type: "file" as const,
          url: attachment.url!,
          mediaType: attachment.mediaType,
          filename: attachment.filename,
        })),
        ...(text || replySelections.length > 0 ? [{ type: "text" as const, text: text || "Empty message" }] : []),
      ],
    });
  }, [attachments, input, replySelections.length, sendMessage]);

  return (
    <form
      className="relative flex w-full flex-col rounded-lg border border-sidebar-border bg-sidebar-accent px-3.5 pt-2 pb-1 shadow-[0_9px_9px_0px_rgba(0,0,0,0.01),0_2px_5px_0px_rgba(0,0,0,0.06)]"
      onClick={() => focusComposer()}
      onSubmit={(event) => {
        event.preventDefault();
        void handleSend();
      }}
    >
      {attachments.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs">
              <span>{attachment.filename}</span>
              {attachment.isUploading ? <span className="text-muted-foreground">Uploading…</span> : null}
              <button type="button" onClick={(event) => {
                event.preventDefault();
                setAttachments((current) => current.filter((candidate) => candidate.id !== attachment.id));
              }}>
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <CardContextDisplay items={items} />
      <ReplyContextDisplay />
      <div className="relative">
        <textarea
          ref={composerRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onPaste={handlePaste}
          onKeyDown={(event) => {
            mention.handleKeyDown(event);
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSend();
            }
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void handleSend();
            }
          }}
          onInput={mention.handleInput}
          placeholder="Ask anything or @mention items"
          className="max-h-32 min-h-20 w-full resize-none bg-transparent py-1.5 text-base text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/60"
          rows={1}
          maxLength={10000}
        />
        <MentionMenu
          open={mention.mentionMenuOpen}
          onOpenChange={mention.handleMentionMenuClose}
          query={mention.mentionQuery}
          items={items}
          onSelect={mention.handleMentionSelect}
          selectedCardIds={selectedCardIds}
          selectedIndicator={(isSelected) => isSelected ? <CheckCircle2 className="size-4 text-primary" /> : undefined}
        />
      </div>
      <ComposerToolbar
        onFilesSelected={addFiles}
        canSend={Boolean(input.trim()) || attachments.length > 0 || replySelections.length > 0}
        onSend={handleSend}
        onStop={stop}
        isRunning={status === "submitted" || status === "streaming"}
        input={input}
        setInput={setInput}
      />
    </form>
  );
}
