import type {
  ClipboardEvent,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAui, useAuiState } from "@assistant-ui/react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";

import { useSelectedCardIds } from "@/hooks/ui/use-selected-card-ids";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useAttachmentUploadStore } from "@/lib/stores/attachment-upload-store";
import {
  selectReplySelections,
  useUIStore,
} from "@/lib/stores/ui-store";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { buildWorkspaceItemDefinitionsFromAssets } from "@/lib/uploads/uploaded-asset";
import {
  getDocumentUploadFailureMessage,
  getDocumentUploadPartialMessage,
  getDocumentUploadSuccessMessage,
} from "@/lib/uploads/upload-feedback";
import { uploadSelectedFiles } from "@/lib/uploads/upload-selection";
import { startAssetProcessing } from "@/lib/uploads/start-asset-processing";
import { isOfficeDocument } from "@/lib/uploads/office-document-validation";
import type { Item } from "@/lib/workspace-state/types";

import { ThreadStateWithMainThreadId } from "./shared";

type ComposerAttachmentWithFile = {
  file?: File | null;
};

export function useThreadComposer() {
  const currentWorkspaceId = useWorkspaceStore(
    (state) => state.currentWorkspaceId,
  );
  const aui = useAui();
  const replySelections = useUIStore(useShallow(selectReplySelections));
  const clearReplySelections = useUIStore(
    (state) => state.clearReplySelections,
  );
  const toggleCardSelection = useUIStore((state) => state.toggleCardSelection);
  const { selectedCardIds } = useSelectedCardIds();

  const { state: workspaceState } = useWorkspaceState(currentWorkspaceId);
  const operations = useWorkspaceOperations(currentWorkspaceId, workspaceState);

  const mainThreadId = useAuiState(
    ({ threads }) =>
      (threads as ThreadStateWithMainThreadId | undefined)?.mainThreadId,
  );
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!mainThreadId || !inputRef.current) return;

    const timeoutId = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [mainThreadId]);

  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(
    null,
  );

  const handleInput = useCallback(
    (e: FormEvent<HTMLTextAreaElement>) => {
      const textarea = e.currentTarget;
      const value = textarea.value;
      const cursorPos = textarea.selectionStart ?? 0;

      if (mentionStartIndex === null) return;

      const query = value.slice(mentionStartIndex + 1, cursorPos);
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
    },
    [mentionStartIndex],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
    if (mentionStartIndex === null || !inputRef.current) return;

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
      if (!inputRef.current) return;

      inputRef.current.focus();
      const newCursorPos = textBefore.length;
      inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }, [aui, mentionStartIndex]);

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

  const handlePaste = useCallback(
    async (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const clipboardData = e.clipboardData;
      if (!clipboardData || !currentWorkspaceId) return;

      const files = Array.from(clipboardData.files) as File[];
      if (files.length > 0) {
        e.preventDefault();

        const imageFile = files.find((file) => file.type.startsWith("image/"));
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

      const clipboardItems = Array.from(clipboardData.items) as DataTransferItem[];
      const imageItem = clipboardItems.find((item) =>
        item.type.startsWith("image/"),
      );

      if (!imageItem) return;

      e.preventDefault();
      const file = imageItem.getAsFile();
      if (!file) return;

      try {
        await aui?.composer()?.addAttachment(file);
      } catch (error) {
        console.error("Failed to add image attachment:", error);
      }
    },
    [aui, currentWorkspaceId],
  );

  const processPdfAttachmentsInBackground = useCallback(
    async (pdfAttachments: ComposerAttachmentWithFile[]) => {
      if (!currentWorkspaceId) return;

      let files: File[] = [];
      try {
        files = pdfAttachments
          .map((attachment) => attachment.file)
          .filter((file): file is File => !!file);

        const { uploads, failedFiles } = await uploadSelectedFiles(files);
        if (uploads.length === 0) {
          toast.error(
            getDocumentUploadFailureMessage(failedFiles.length || files.length),
          );
          return;
        }

        const pdfCardDefinitions =
          buildWorkspaceItemDefinitionsFromAssets(uploads);
        const createdIds = operations.createItems(pdfCardDefinitions, {
          showSuccessToast: false,
        });

        void startAssetProcessing({
          workspaceId: currentWorkspaceId,
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
      } catch (error) {
        console.error("Error creating PDF cards in background:", error);
        toast.error(
          getDocumentUploadFailureMessage(files.length || pdfAttachments.length),
        );
      }
    },
    [currentWorkspaceId, operations],
  );

  const prepareComposerSend = useCallback(() => {
    if (useAttachmentUploadStore.getState().uploadingIds.size > 0) {
      toast.info("Please wait for uploads to finish before sending");
      return false;
    }

    const composerState = aui?.composer()?.getState();
    if (!composerState) {
      return false;
    }

    const currentText = composerState.text ?? "";
    const attachments = composerState.attachments ?? [];
    const hasReplyContext = replySelections.length > 0;

    if (!currentText.trim() && attachments.length === 0 && !hasReplyContext) {
      return false;
    }

    const pdfAttachments = attachments.filter((attachment) => {
      const file = attachment.file;
      return (
        file &&
        (file.type === "application/pdf" ||
          file.name.toLowerCase().endsWith(".pdf") ||
          isOfficeDocument(file))
      );
    });

    if (pdfAttachments.length > 0) {
      void processPdfAttachmentsInBackground(pdfAttachments);
    }

    const modifiedText =
      currentText.trim() || (hasReplyContext ? "Empty message" : "");

    const customMetadata: Record<string, unknown> = {};
    if (replySelections.length > 0) {
      customMetadata.replySelections = replySelections;
    }

    aui
      ?.composer()
      ?.setRunConfig(
        Object.keys(customMetadata).length > 0 ? { custom: customMetadata } : {},
      );

    if (modifiedText !== currentText) {
      aui?.composer()?.setText(modifiedText);
    }

    clearReplySelections();
    return true;
  }, [
    aui,
    clearReplySelections,
    processPdfAttachmentsInBackground,
    replySelections,
  ]);

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      if (!prepareComposerSend()) {
        e.preventDefault();
      }
    },
    [prepareComposerSend],
  );

  const handleSendClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      if (!prepareComposerSend()) {
        e.preventDefault();
      }
    },
    [prepareComposerSend],
  );

  return {
    canReplyOnlySend: replySelections.length > 0,
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
  };
}
