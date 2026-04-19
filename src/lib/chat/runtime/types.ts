export type ChatMessageRole = "user" | "assistant" | "system";

export type ChatTextPart = { type: "text"; text: string };
export type ChatMessagePart =
  | ChatTextPart
  | { type: "file"; [k: string]: unknown }
  | { type: "image"; [k: string]: unknown }
  | { type: "source"; [k: string]: unknown }
  | { type: "reasoning"; [k: string]: unknown }
  | { type: "tool-call" | "tool-result" | "tool"; [k: string]: unknown }
  | { type: string; [k: string]: unknown };

export interface ChatMessage {
  id?: string;
  role: ChatMessageRole;
  content: ChatMessagePart[];
  metadata?: { custom?: Record<string, unknown>; [k: string]: unknown };
}

export interface ThreadState {
  messageCount: number;
  isLoading: boolean;
  isEmpty: boolean;
  isRunning: boolean;
}

export interface ComposerStateSnapshot {
  text: string;
  attachments: Array<{
    id?: string;
    file?: File;
    name?: string;
    type?: string;
    [k: string]: unknown;
  }>;
  runConfig?: { custom?: Record<string, unknown> };
}

export interface ComposerActions {
  setText(text: string): void;
  send(): void;
  addAttachment(file: File): Promise<unknown>;
  setRunConfig(config: { custom?: Record<string, unknown> }): void;
  getState(): ComposerStateSnapshot | undefined;
}
import type {
  TextMessagePartProps,
  FileMessagePartComponent,
  ImageMessagePartComponent,
  SourceMessagePartComponent,
  ToolCallMessagePartComponent,
  ReasoningMessagePartComponent,
  ReasoningGroupComponent,
} from "@assistant-ui/react";

/**
 * Type re-exports — the ACL owns the identity of these types so consumers never
 * import them directly from @assistant-ui/react.
 */
export type ChatTextPartProps = TextMessagePartProps;
export type ChatFilePartComponent = FileMessagePartComponent;
export type ChatImagePartComponent = ImageMessagePartComponent;
export type ChatSourcePartComponent = SourceMessagePartComponent;
export type ChatToolCallPartComponent = ToolCallMessagePartComponent;
export type ChatReasoningPartComponent = ReasoningMessagePartComponent;
export type ChatReasoningGroupComponent = ReasoningGroupComponent;
