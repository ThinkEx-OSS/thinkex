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
} from "./types";

/**
 * Local shape describing the @assistant-ui/react state fields we actually read.
 * This is intentionally minimal — assistant-ui does not export its state type,
 * so the ACL defines what it needs. Expand as new selectors are added.
 */
interface AuiStateShape {
  thread?: {
    messages?: ReadonlyArray<{ id?: string }>;
    isLoading?: boolean;
    isEmpty?: boolean;
    isRunning?: boolean;
  };
  threads?: {
    mainThreadId?: string;
  };
  threadListItem?: {
    id?: string;
  };
  composer?: {
    text?: string;
  };
  message?: {
    id?: string;
    role?: "user" | "assistant" | "system";
    status?: { type?: string };
    parts?: ReadonlyArray<{ type?: string; text?: string }>;
    content?: readonly unknown[];
    metadata?: { custom?: Record<string, unknown>; [k: string]: unknown };
  };
  attachment?: {
    id?: string;
    type?: string;
    name?: string;
    file?: File & { name: string };
    content?: ReadonlyArray<{ type: string; text?: string; image?: string }>;
  };
}


export function useIsThreadLoading(): boolean {
  return useAuiState((s: AuiStateShape) => !!s.thread?.isLoading);
}

export function useIsThreadEmpty(): boolean {
  return useAuiState((s: AuiStateShape) => s.thread?.isEmpty ?? true);
}

export function useIsThreadRunning(): boolean {
  return useAuiState((s: AuiStateShape) => !!s.thread?.isRunning);
}

export function useThreadMessageCount(): number {
  return useAuiState((s: AuiStateShape) => s.thread?.messages?.length ?? 0);
}

export function useMainThreadId(): string | null {
  return useAuiState((s: AuiStateShape) => s.threads?.mainThreadId ?? null);
}

export function useHasPromptInputText(): boolean {
  return useAuiState((s: AuiStateShape) => Boolean((s.composer?.text ?? "").trim()));
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
  return useAuiState((s: AuiStateShape) => s.message?.id ?? null);
}

/** True while this message is actively streaming. */
export function useIsMessageRunning(): boolean {
  return useAuiState((s: AuiStateShape) => s.message?.status?.type === "running");
}

/**
 * True when the current message has no content parts — used to show loading
 * states before the first token arrives.
 */
export function useIsMessageEmpty(): boolean {
  return useAuiState((s: AuiStateShape) => {
    const msg = s.message;
    return !msg?.content || (Array.isArray(msg.content) && msg.content.length === 0);
  });
}

/**
 * True when the current message is the last message in the thread.
 * Used to gate old reasoning/tool groups from rendering once newer messages exist.
 */
export function useIsLastMessage(): boolean {
  return useAuiState((s: AuiStateShape) => {
    const thread = s.thread;
    const messageId = s.message?.id;
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
  return useAuiState((s: AuiStateShape) => {
    const msg = s.message;
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
  return useAuiState((s: AuiStateShape) => {
    const parts = s.message?.parts ?? [];
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
  return useAuiState((s: AuiStateShape) => s.attachment?.id);
}

/** Whether the current attachment is an image. */
export function useIsAttachmentImage(): boolean {
  return useAuiState((s: AuiStateShape) => s.attachment?.type === "image");
}

/**
 * Shallow-equal snapshot of the current attachment object. The returned object
 * is stable across renders when the underlying assistant-ui attachment state
 * hasn't changed.
 */
export function useAttachmentSnapshot(): ChatAttachmentSnapshot | undefined {
  return useAuiState(
    useShallow((s: AuiStateShape) => {
      const att = s.attachment;
      if (!att) return undefined;
      return {
        id: att.id,
        type: att.type,
        name: att.name,
        file: att.file,
        content: att.content,
      } as ChatAttachmentSnapshot;
    }),
  );
}

/** Current chat message from MessageRuntime context — returns the entire message object. */
export function useCurrentChatMessage(): CurrentChatMessage | undefined {
  return useAuiState((s: AuiStateShape) => s.message as CurrentChatMessage | undefined);
}

/** id of the current thread-list item (if open inside a ThreadListItemPrimitive.Root). */
export function useThreadListItemId(): string | undefined {
  return useAuiState((s: AuiStateShape) => s.threadListItem?.id);
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
