"use client";

/**
 * Props each chat-v2 tool UI component receives.
 *
 * Mirrors the native `ai-sdk v6` tool-part shape (from `UIMessage.parts[i]` when
 * `part.type === 'tool-<name>'`) so PR 3 can dispatch directly without translation.
 *
 * State semantics from ai-sdk v6:
 *   - "input-streaming"   — model is streaming tool input (may be partial)
 *   - "input-available"   — input is complete, tool is executing
 *   - "output-available"  — tool returned output (may still represent domain failure via output.success=false)
 *   - "output-error"      — tool threw (errorText contains message)
 */
export type ToolUIState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

export interface ToolUIProps<Input, Output> {
  toolCallId: string;
  state: ToolUIState;
  /** Partial when state is input-streaming; fully formed when input-available and later. */
  input?: Partial<Input> | Input;
  /** Present when state is output-available. */
  output?: Output;
  /** Present when state is output-error. */
  errorText?: string;
}
