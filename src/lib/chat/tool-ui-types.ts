import type { ToolUIPart } from "ai";

/**
 * Status shape exposed to the per-tool render functions.
 */
export type ChatToolStatus =
  | { type: "running"; reason?: undefined }
  | { type: "complete"; reason?: undefined }
  | { type: "incomplete"; reason: "error" | "denied" | "cancelled" };

export interface ChatToolUIRenderArgs<Args = unknown, Result = unknown> {
  status: ChatToolStatus;
  args: Args;
  result?: Result;
}

export interface ChatToolUIProps<Args = unknown, Result = unknown> {
  render: (args: ChatToolUIRenderArgs<Args, Result>) => React.ReactNode;
}

/**
 * Convert an AI SDK `ToolUIPart` into the legacy `{ status, args, result }`
 * shape used by the render functions in `src/components/chat/tools/*`.
 */
export function toolPartToRenderArgs<Args = unknown, Result = unknown>(
  part: ToolUIPart,
): ChatToolUIRenderArgs<Args, Result> {
  const args = (part.input ?? {}) as Args;
  let result = part.output as Result | undefined;
  let status: ChatToolStatus;

  switch (part.state) {
    case "input-streaming":
    case "input-available":
    case "approval-requested":
    case "approval-responded":
      status = { type: "running" };
      break;
    case "output-available":
      status = { type: "complete" };
      break;
    case "output-error":
      status = { type: "incomplete", reason: "error" };
      if (
        result === undefined &&
        typeof (part as { errorText?: string }).errorText === "string"
      ) {
        result = {
          success: false,
          message: (part as { errorText?: string }).errorText,
        } as unknown as Result;
      }
      break;
    case "output-denied":
      status = { type: "incomplete", reason: "denied" };
      break;
    default:
      status = { type: "running" };
  }

  return { status, args, result };
}
