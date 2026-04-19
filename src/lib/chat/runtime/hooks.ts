"use client";

import {
  useAui,
  useAuiState,
  useAssistantContext,
  useMessage,
  useMessagePartText,
  useScrollLock,
  useThreadListItem,
} from "@assistant-ui/react";
import { useShallow } from "zustand/shallow";
import type {
  ChatAttachmentSnapshot,
  ChatAssistantContextOptions,
  ChatMessage,
  ChatThreadListItem,
  ComposerActions,
  ComposerStateSnapshot,
  CurrentChatMessage,
  AttachmentScope,
  PromptInputThreadActions,
  ThreadState,
} from "./types";

export function useThreadState(): ThreadState {
  return useAuiState((s: any) => ({
    messageCount: s.thread?.messages?.length ?? 0,
    isLoading: !!s.thread?.isLoading,
    isEmpty: s.thread?.isEmpty ?? true,
    isRunning: !!s.thread?.isRunning,
  }));
}

export function useIsThreadLoading(): boolean {
  return useAuiState((s: any) => !!s.thread?.isLoading);
}

export function useIsThreadEmpty(): boolean {
  return useAuiState((s: any) => s.thread?.isEmpty ?? true);
}

export function useIsThreadRunning(): boolean {
  return useAuiState((s: any) => !!s.thread?.isRunning);
}

export function useThreadMessageCount(): number {
  return useAuiState((s: any) => s.thread?.messages?.length ?? 0);
}

export function useMainThreadId(): string | null {
  return useAuiState((s: any) => s.threads?.mainThreadId ?? null);
}

export function useHasPromptInputText(): boolean {
  return useAuiState((s: any) => Boolean((s.composer?.text ?? "").trim()));
}

export function useChatMessage(): ChatMessage {
  const msg = useMessage();
  return msg as unknown as ChatMessage;
}

export function useChatMessagePartText() {
  return useMessagePartText();
}

export function usePromptInput(): ComposerActions | null {
  const aui = useAui();
  if (!aui) return null;
  const composer = aui.composer?.();
  if (!composer) return null;
  return {
    setText: (t) => composer.setText(t),
    send: () => composer.send(),
    addAttachment: (f) => composer.addAttachment(f),
    setRunConfig: (cfg) => composer.setRunConfig(cfg as any),
    getState: () => composer.getState() as unknown as ComposerStateSnapshot | undefined,
  };
}
/**
 * Lock the given element's scroll position for a fixed duration. Used when
 * collapsing streaming content to prevent scroll jumps.
 */
export const useChatScrollLock = useScrollLock;

/** Current assistant/user message id from MessageRuntime context. */
export function useCurrentMessageId(): string | null {
  return useAuiState((s: any) => (s.message as { id?: string } | undefined)?.id ?? null);
}

/** True while this message is actively streaming. */
export function useIsMessageRunning(): boolean {
  return useAuiState((s: any) => (s.message as { status?: { type?: string } } | undefined)?.status?.type === "running");
}

/**
 * True when the current message has no content parts — used to show loading
 * states before the first token arrives.
 */
export function useIsMessageEmpty(): boolean {
  return useAuiState((s: any) => {
    const msg = s.message as { content?: unknown[] } | undefined;
    return !msg?.content || (Array.isArray(msg.content) && msg.content.length === 0);
  });
}

/**
 * True when the current message is the last message in the thread.
 * Used to gate old reasoning/tool groups from rendering once newer messages exist.
 */
export function useIsLastMessage(): boolean {
  return useAuiState((s: any) => {
    const thread = s.thread as { messages?: Array<{ id?: string }> } | undefined;
    const messageId = (s.message as { id?: string } | undefined)?.id;
    const messages = thread?.messages ?? [];
    const idx = messages.findIndex((m) => m.id === messageId);
    return idx >= 0 && idx === messages.length - 1;
  });
}

/**
 * True when the current streaming part is of `partType` and falls within
 * [startIndex, endIndex]. Shared by ReasoningGroup and ToolGroup to detect
 * whether the group is actively streaming.
 */
export function useIsMessagePartStreaming(
  partType: string,
  startIndex: number,
  endIndex: number,
): boolean {
  return useAuiState((s: any) => {
    const msg = s.message as
      | { status?: { type?: string }; parts?: Array<{ type?: string }> }
      | undefined;
    if (msg?.status?.type !== "running") return false;
    const parts = msg.parts ?? [];
    const lastIndex = parts.length - 1;
    if (lastIndex < 0) return false;
    const lastType = parts[lastIndex]?.type;
    if (lastType !== partType) return false;
    return lastIndex >= startIndex && lastIndex <= endIndex;
  });
}

/**
 * Sum the `.text` length of all parts of `partType` within [startIndex, endIndex].
 * Used to force re-renders of scroll effects as streaming text grows.
 */
export function useMessagePartTextLengthSnapshot(
  partType: string,
  startIndex: number,
  endIndex: number,
): number {
  return useAuiState((s: any) => {
    const parts = (s.message as { parts?: Array<{ type?: string; text?: string }> } | undefined)?.parts ?? [];
    let len = 0;
    for (let i = startIndex; i <= endIndex && i < parts.length; i++) {
      const p = parts[i];
      if (p?.type === partType && typeof p.text === "string") len += p.text.length;
    }
    return len;
  });
}

/**
 * Scope of the current attachment ("composer" for user uploads, "message" for rendered attachments in a chat message).
 * Reads `aui.attachment.source` from the AttachmentPrimitive context.
 */
export function useAttachmentScope(): AttachmentScope {
  const aui = useAui();
  const source = (aui as unknown as { attachment?: { source?: string } } | null)?.attachment?.source;
  return source === "composer" ? "composer" : "message";
}

/** Attachment id from AttachmentPrimitive context. */
export function useAttachmentId(): string | undefined {
  return useAuiState((s: any) => (s.attachment as { id?: string } | undefined)?.id);
}

/** Whether the current attachment is an image. */
export function useIsAttachmentImage(): boolean {
  return useAuiState((s: any) => (s.attachment as { type?: string } | undefined)?.type === "image");
}

/**
 * Shallow-equal snapshot of the current attachment object. The returned object
 * is stable across renders when the underlying assistant-ui attachment state
 * hasn't changed.
 */
export function useAttachmentSnapshot(): ChatAttachmentSnapshot | undefined {
  return useAuiState(
    useShallow((s: any) => {
      const att = s.attachment as ChatAttachmentSnapshot | undefined;
      if (!att) return undefined;
      return {
        id: att.id,
        type: att.type,
        name: att.name,
        file: att.file,
        content: att.content,
      };
    }),
  );
}

/** Current chat message from MessageRuntime context — returns the entire message object. */
export function useCurrentChatMessage(): CurrentChatMessage | undefined {
  return useAuiState((s: any) => s.message as CurrentChatMessage | undefined);
}

/** id of the current thread-list item (if open inside a ThreadListItemPrimitive.Root). */
export function useThreadListItemId(): string | undefined {
  return useAuiState((s: any) => (s.threadListItem as { id?: string } | undefined)?.id);
}

/**
 * Safe wrapper around assistant-ui's useThreadListItem() — returns the current thread list item.
 * Used by AppChatHeader and thread-list-dropdown to read the current thread title and initialization state.
 */
export function useChatThreadListItem(): ChatThreadListItem | undefined {
  return useThreadListItem() as unknown as ChatThreadListItem | undefined;
}

/**
 * Actions exposed on the current thread-list item (e.g. rename). Returns null when runtime isn't ready.
 * Consumers previously wrote `aui?.threadListItem().rename(title)` — this facade moves that call behind the ACL.
 */
export function usePromptInputThreadActions(): PromptInputThreadActions | null {
  const aui = useAui();
  if (!aui) return null;
  const item = (aui as unknown as { threadListItem?: () => { rename?: (t: string) => Promise<unknown> } }).threadListItem?.();
  if (!item) return null;
  return {
    rename: (newTitle: string) => {
      if (!item.rename) return Promise.resolve();
      return item.rename(newTitle);
    },
  };
}

/**
 * Inject workspace/user context into the assistant's prompt.
 * Thin wrapper around assistant-ui's useAssistantContext — same signature.
 */
export function useChatAssistantContext(options: ChatAssistantContextOptions): void {
  useAssistantContext(options);
}
