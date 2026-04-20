"use client";

import { AssistantAvailableProvider } from "@/contexts/AssistantAvailabilityContext";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Item } from "@/lib/workspace-state/types";
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
  const initialThreadId = searchParams.get("thread");

  return (
    <AssistantAvailableProvider>
      <ChatRuntimeProvider workspaceId={workspaceId} items={items} initialThreadId={initialThreadId} onReady={onReady}>
        <ChatV2PanelContent workspaceId={workspaceId} {...rest} />
      </ChatRuntimeProvider>
    </AssistantAvailableProvider>
  );
}
