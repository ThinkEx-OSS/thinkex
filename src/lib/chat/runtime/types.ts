import type {
  AttachmentPrimitive as _AP,
  TextMessagePartProps,
  FileMessagePartComponent,
  ImageMessagePartComponent,
  SourceMessagePartComponent,
  ToolCallMessagePartComponent,
  ReasoningMessagePartComponent,
  ReasoningGroupComponent,
  AssistantToolUIProps,
} from '@assistant-ui/react';

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
export type ChatToolUIProps<Args = unknown, Result = unknown> = AssistantToolUIProps<Args, Result>;

/** Scope an attachment belongs to — either the user composer or a rendered message. */
export type AttachmentScope = "composer" | "message";

/**
 * Snapshot of the current attachment in AttachmentPrimitive context. Read by
 * AttachmentThumb / AttachmentUI to render previews, labels, and upload states.
 */
export interface ChatAttachmentSnapshot {
  id?: string;
  type?: string;
  name?: string;
  file?: File & { name: string };
  content?: Array<{ type: string; text?: string; image?: string }>;
}

/** Props for the neutral ChatAttachment primitive — mirrors AttachmentPrimitive.Root. */
export type ChatAttachmentRootProps = _AP.Root.Props;

/**
 * Thread list item handle (returned by useChatThreadListItem).
 * The `remoteId` is populated after the thread has been initialized on the server.
 */
export interface ChatThreadListItem {
  id?: string;
  title?: string;
  remoteId?: string;
  [key: string]: unknown;
}

/** The current chat message as exposed by useCurrentChatMessage. Used by MessageContextBadges. */
export interface CurrentChatMessage {
  id?: string;
  role?: "user" | "assistant" | "system";
  metadata?: { custom?: Record<string, unknown>; [k: string]: unknown };
  content?: unknown[];
  [key: string]: unknown;
}

/** Options for useChatAssistantContext, mirrors assistant-ui's useAssistantContext. */
export interface ChatAssistantContextOptions {
  disabled?: boolean;
  getContext: () => string;
}

/** Handle returned by usePromptInputThreadActions — lets consumers rename the current thread. */
export interface PromptInputThreadActions {
  rename(newTitle: string): Promise<unknown>;
}
