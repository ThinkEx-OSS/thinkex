"use client";

import { AssistantAvailableProvider } from "@/contexts/AssistantAvailabilityContext";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Item } from "@/lib/workspace-state/types";
import { DataStreamProvider } from "@/lib/chat-v2/data-stream-provider";
import { ChatRuntimeProvider, useChatRuntime } from "@/lib/chat-v2/use-chat-runtime";
import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { TextSelectionManager } from "./TextSelectionManager";

interface ChatV2PanelProps {
  workspaceId: string;
  items: Item[];
  setIsChatExpanded?: (expanded: boolean) => void;
  isChatMaximized?: boolean;
  setIsChatMaximized?: (maximized: boolean) => void;
  onReady?: () => void;
}

function ChatV2PanelContent({ workspaceId, setIsChatExpanded, isChatMaximized, setIsChatMaximized }: Omit<ChatV2PanelProps, "items" | "onReady">) {
  const { threadId, setThreadId, messages, status, isLoading, refreshMessagesIfSafe, regenerate, focusComposer } = useChatRuntime();

  return (
    <div className={cn("flex h-full flex-col bg-sidebar", isChatMaximized && "shadow-2xl")} data-tour="chat-panel">
      <ChatHeader
        workspaceId={workspaceId}
        threadId={threadId}
        onSelectThread={setThreadId}
        onCollapse={() => {
          if (isChatMaximized) setIsChatMaximized?.(false);
          setIsChatExpanded?.(false);
        }}
        isMaximized={isChatMaximized}
        onToggleMaximize={() => setIsChatMaximized?.(!isChatMaximized)}
      />
      <MessageList
        threadId={threadId}
        messages={messages}
        status={status}
        isLoading={isLoading}
        onReloadThread={refreshMessagesIfSafe}
        onRegenerate={(messageId) => regenerate({ messageId })}
      />
      <div className="mx-auto flex w-full max-w-[50rem] flex-shrink-0 flex-col gap-4 px-4 pb-3 md:pb-4">
        <Composer />
      </div>
      <TextSelectionManager className="absolute inset-0 pointer-events-none" currentThreadId={threadId} onFocusComposer={focusComposer} />
    </div>
  );
}

export function ChatV2Panel({ workspaceId, items, onReady, ...rest }: ChatV2PanelProps) {
  const searchParams = useSearchParams();
  const urlThreadId = searchParams.get("thread");
  const [providerThreadId, setProviderThreadId] = useState<string | null>(urlThreadId);
  const persistedThreadIdRef = useRef<string | null>(null);
  const providerKey = providerThreadId ?? "new";

  useEffect(() => {
    if (urlThreadId === persistedThreadIdRef.current) {
      persistedThreadIdRef.current = null;
      return;
    }
    if (urlThreadId !== providerThreadId) {
      setProviderThreadId(urlThreadId);
    }
  }, [providerThreadId, urlThreadId]);

  return (
    <AssistantAvailableProvider>
      <DataStreamProvider key={providerKey}>
        {/* Remount on explicit thread switches like route-driven chat UIs, but keep new-chat streams alive when the server persists a thread id. */}
        <ChatRuntimeProvider
          key={providerKey}
          workspaceId={workspaceId}
          items={items}
          initialThreadId={providerThreadId}
          onThreadSelectionChange={setProviderThreadId}
          onThreadResolved={(threadId) => {
            persistedThreadIdRef.current = threadId;
          }}
          onReady={onReady}
        >
          <ChatV2PanelContent workspaceId={workspaceId} {...rest} />
        </ChatRuntimeProvider>
      </DataStreamProvider>
    </AssistantAvailableProvider>
  );
}
