import {
  ActionBarPrimitive,
  AttachmentPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import type { BranchPickerPrimitive as _BPP } from "@assistant-ui/react";

export const ChatThread = ThreadPrimitive;
export const ChatMessage = MessagePrimitive;
export const ChatPromptInput = ComposerPrimitive;
export const ChatAttachment = AttachmentPrimitive;
export const ChatActionBar = ActionBarPrimitive;
export const ChatBranchPicker = BranchPickerPrimitive;
export const ChatError = ErrorPrimitive;
export const ChatIf = AuiIf;

export type ChatBranchPickerRootProps = _BPP.Root.Props;
