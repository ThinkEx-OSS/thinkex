import type { ToolUIPart, UIMessage } from "ai";
import type { ReplySelection } from "@/lib/stores/ui-store";

export type ChatMetadata = {
  replySelections?: ReplySelection[];
  selectedCards?: string[];
};

export type ChatDataTypes = Record<string, never>;
export type ChatTools = Record<string, { input: unknown; output: unknown }>;

export type ChatMessage = UIMessage<ChatMetadata, ChatDataTypes, ChatTools>;
export type ChatMessagePart = ChatMessage["parts"][number];
export type ChatToolPart = ToolUIPart<ChatTools>;

export type ThreadMessageRow = {
  id: string;
  parent_id: string | null;
  format: string;
  content: unknown;
  created_at: string;
};

export type ThreadMessagesResponse = {
  messages: ThreadMessageRow[];
  headId?: string;
};

export type BranchSiblingsResponse = {
  siblings: Array<{
    id: string;
    parentId: string | null;
    createdAt: string;
  }>;
  currentIndex: number;
};
