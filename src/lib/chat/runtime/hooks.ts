"use client";

import {
  useAui,
  useAuiState,
  useMessage,
  useMessagePartText,
} from "@assistant-ui/react";
import type {
  ChatMessage,
  ComposerActions,
  ComposerStateSnapshot,
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
