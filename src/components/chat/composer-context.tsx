"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { toast } from "sonner";

import { emitPasswordProtectedPdf } from "@/components/modals/PasswordProtectedPdfDialog";
import { useChatContext } from "@/components/chat/ChatProvider";
import { useAttachmentUploadStore } from "@/lib/stores/attachment-upload-store";
import { selectReplySelections, useUIStore } from "@/lib/stores/ui-store";
import { uploadFileDirect } from "@/lib/uploads/client-upload";
import { isOfficeDocument } from "@/lib/uploads/office-document-validation";
import { isPasswordProtectedPdf } from "@/lib/uploads/pdf-validation";
import { processPdfAttachmentsInBackground } from "@/lib/uploads/process-pdf-attachments-in-background";
import { useShallow } from "zustand/react/shallow";

import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export type ComposerAttachmentStatus = "uploading" | "ready" | "error";

export interface ComposerAttachment {
  id: string;
  /** Original File handle while still client-side. Cleared once we have a final URL. */
  file: File;
  name: string;
  contentType: string;
  /** "image" | "document" | "file" — drives icon/preview choice. */
  kind: "image" | "document" | "file";
  status: ComposerAttachmentStatus;
  /** Resolved upload URL once status === "ready". */
  url?: string;
  errorMessage?: string;
}

export interface ComposerContextValue {
  input: string;
  setInput: (value: string) => void;
  attachments: ComposerAttachment[];
  addAttachments: (files: File[] | FileList) => Promise<void>;
  removeAttachment: (id: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /**
   * Programmatically focus the textarea. Runs on the next animation frame so
   * it survives closing modals/dropdowns that release focus on unmount. Pass
   * `{ cursorAtEnd: true }` after a `setInput(...)` insert so the caret lands
   * at the end of the new text.
   */
  focus: (options?: { cursorAtEnd?: boolean }) => void;
  /**
   * Build a UIMessage and call `sendMessage`. Awaits any in-flight uploads,
   * pulls reply selections from zustand, and resets local state on success.
   */
  submit: () => Promise<void>;
  /** True while uploads are in flight (composer should disable submit). */
  hasUploadingAttachments: boolean;
}

const ComposerContext = createContext<ComposerContextValue | null>(null);

export function useComposer(): ComposerContextValue {
  const ctx = useContext(ComposerContext);
  if (!ctx) throw new Error("useComposer must be used inside <ComposerProvider>");
  return ctx;
}

export function useOptionalComposer(): ComposerContextValue | null {
  return useContext(ComposerContext);
}

function detectKind(file: File): ComposerAttachment["kind"] {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || isOfficeDocument(file)) return "document";
  return "file";
}

interface ComposerProviderProps {
  children: ReactNode;
}

/**
 * Owns composer state (input + attachments) and bridges into `useChat`. Lives
 * inside `ChatProvider` so submission has access to `sendMessage`.
 *
 * Uploads run optimistically in the background — the composer immediately
 * shows a chip with a spinner while `uploadFileDirect` runs. `submit()`
 * awaits any in-flight uploads before constructing the message parts.
 */
export function ComposerProvider({ children }: ComposerProviderProps) {
  const { sendMessage, workspaceId } = useChatContext();

  const [input, setInputState] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // Tracks upload promises by attachment id so submit() can await them.
  const uploadPromisesRef = useRef(
    new Map<string, Promise<string | null>>(),
  );

  const replySelections = useUIStore(useShallow(selectReplySelections));
  const clearReplySelections = useUIStore(
    (state) => state.clearReplySelections,
  );
  const { state: workspaceState } = useWorkspaceState(workspaceId);
  const operations = useWorkspaceOperations(workspaceId, workspaceState);

  const hasUploadingAttachments = useAttachmentUploadStore(
    (s) => s.uploadingIds.size > 0,
  );

  const setInput = useCallback((value: string) => {
    setInputState(value);
  }, []);

  const focus = useCallback((options?: { cursorAtEnd?: boolean }) => {
    // rAF — not `setTimeout(100)` — because this is usually called while a
    // modal or dropdown is closing. One frame is enough for the DOM to settle;
    // any more is arbitrary and user-visible.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      if (options?.cursorAtEnd) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    uploadPromisesRef.current.delete(id);
    useAttachmentUploadStore.getState().removeUploading(id);
  }, []);

  const addAttachments = useCallback(
    async (files: File[] | FileList) => {
      const incoming = Array.from(files);
      if (incoming.length === 0) return;

      // Validate sizes upfront. We don't run a global "max files" check here —
      // the calling site (dropzone, file picker, paste) already enforces it.
      const accepted: File[] = [];
      const rejected: string[] = [];
      for (const file of incoming) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          rejected.push(`${file.name} (${(file.size / (1024 * 1024)).toFixed(1)}MB)`);
        } else {
          accepted.push(file);
        }
      }
      if (rejected.length > 0) {
        toast.error(
          `The following file${rejected.length > 1 ? "s" : ""} exceed${
            rejected.length === 1 ? "s" : ""
          } the 50MB limit:\n${rejected.join("\n")}`,
        );
      }

      // Reject password-protected PDFs but keep the rest going.
      const pdfs = accepted.filter(
        (f) =>
          f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
      );
      const protectedNames: string[] = [];
      if (pdfs.length > 0) {
        for (const file of pdfs) {
          if (await isPasswordProtectedPdf(file)) {
            protectedNames.push(file.name);
          }
        }
        if (protectedNames.length > 0) {
          emitPasswordProtectedPdf(protectedNames);
        }
      }

      const finalFiles = accepted.filter(
        (f) => !protectedNames.includes(f.name),
      );
      if (finalFiles.length === 0) return;

      const newRows: ComposerAttachment[] = finalFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        contentType: file.type || "application/octet-stream",
        kind: detectKind(file),
        status: "uploading",
      }));

      setAttachments((prev) => [...prev, ...newRows]);

      // Kick off uploads in parallel; track promises for submit() to await.
      for (const row of newRows) {
        useAttachmentUploadStore.getState().addUploading(row.id);
        const promise = (async () => {
          try {
            const result = await uploadFileDirect(row.file);
            setAttachments((prev) =>
              prev.map((a) =>
                a.id === row.id
                  ? {
                      ...a,
                      status: "ready",
                      url: result.url,
                      contentType: result.contentType,
                      name: result.displayName,
                    }
                  : a,
              ),
            );
            return result.url;
          } catch (err) {
            console.error("[composer] upload failed", err);
            setAttachments((prev) =>
              prev.map((a) =>
                a.id === row.id
                  ? {
                      ...a,
                      status: "error",
                      errorMessage:
                        err instanceof Error ? err.message : "Upload failed",
                    }
                  : a,
              ),
            );
            toast.error(`Failed to upload ${row.file.name}`);
            return null;
          } finally {
            useAttachmentUploadStore.getState().removeUploading(row.id);
            uploadPromisesRef.current.delete(row.id);
          }
        })();
        uploadPromisesRef.current.set(row.id, promise);
      }

      // PDFs and Office docs get processed into the workspace in the background
      // (extracts text + creates an item) — same UX as before the migration.
      const pdfsAndOffice = finalFiles.filter(
        (f) =>
          f.type === "application/pdf" ||
          f.name.toLowerCase().endsWith(".pdf") ||
          isOfficeDocument(f),
      );
      if (pdfsAndOffice.length > 0 && workspaceId) {
        const wrapped = newRows
          .filter((row) => pdfsAndOffice.some((f) => f === row.file))
          .map((row) => ({ id: row.id, file: row.file }));
        void processPdfAttachmentsInBackground(
          wrapped,
          workspaceId,
          operations,
        );
      }
    },
    [operations, workspaceId],
  );

  const submit = useCallback(async () => {
    if (hasUploadingAttachments) {
      toast.info("Please wait for uploads to finish before sending");
      return;
    }

    const text = input.trim();
    const hasReplyContext = replySelections.length > 0;
    if (!text && attachments.length === 0 && !hasReplyContext) {
      return;
    }

    // Wait for any in-flight uploads (defensive — usually a no-op since we
    // already block above when `hasUploadingAttachments`).
    await Promise.all(uploadPromisesRef.current.values());

    const readyFiles = attachments.filter(
      (a): a is ComposerAttachment & { url: string } =>
        a.status === "ready" && !!a.url,
    );

    const messageText =
      text || (hasReplyContext ? "Empty message" : "");

    const fileParts = readyFiles.map((a) => ({
      type: "file" as const,
      url: a.url,
      mediaType: a.contentType,
      filename: a.name,
    }));

    const parts = [
      ...(messageText ? [{ type: "text" as const, text: messageText }] : []),
      ...fileParts,
    ];

    if (parts.length === 0) {
      // Nothing to send (e.g. empty text + every attachment errored).
      return;
    }

    const metadata =
      replySelections.length > 0
        ? { custom: { replySelections: [...replySelections] } }
        : undefined;

    setInputState("");
    setAttachments([]);
    uploadPromisesRef.current.clear();
    clearReplySelections();

    void sendMessage({
      role: "user",
      parts,
      ...(metadata ? { metadata } : {}),
    });
  }, [
    attachments,
    clearReplySelections,
    hasUploadingAttachments,
    input,
    replySelections,
    sendMessage,
  ]);

  const value = useMemo<ComposerContextValue>(
    () => ({
      input,
      setInput,
      attachments,
      addAttachments,
      removeAttachment,
      inputRef,
      focus,
      submit,
      hasUploadingAttachments,
    }),
    [
      input,
      setInput,
      attachments,
      addAttachments,
      removeAttachment,
      focus,
      submit,
      hasUploadingAttachments,
    ],
  );

  return (
    <ComposerContext.Provider value={value}>
      {children}
    </ComposerContext.Provider>
  );
}
