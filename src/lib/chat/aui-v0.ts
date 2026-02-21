import type { ThreadMessage } from "@assistant-ui/react";
import { INTERNAL } from "@assistant-ui/react";

type StoredMessage = {
  id: string;
  parent_id: string | null;
  format: string;
  content: unknown;
  created_at: string;
};

type AuiV0MessagePart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "reasoning"; readonly text: string }
  | {
      readonly type: "source";
      readonly sourceType: "url";
      readonly id: string;
      readonly url: string;
      readonly title?: string;
    }
  | {
      readonly type: "tool-call";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly args?: Record<string, unknown>;
      readonly argsText?: string;
      readonly result?: unknown;
      readonly isError?: true;
    }
  | { readonly type: "image"; readonly image: string }
  | {
      readonly type: "file";
      readonly data: string;
      readonly mimeType: string;
      readonly filename?: string;
    };

type AuiV0Message = {
  readonly role: "assistant" | "user" | "system";
  readonly status?: { type: string; reason?: string };
  readonly content: readonly AuiV0MessagePart[];
  readonly metadata: {
    readonly unstable_state?: unknown;
    readonly unstable_annotations: readonly unknown[];
    readonly unstable_data: readonly unknown[];
    readonly steps: readonly { readonly usage?: { inputTokens?: number; outputTokens?: number } }[];
    readonly custom: Record<string, unknown>;
  };
};

export function auiV0Encode(message: ThreadMessage): AuiV0Message {
  const status =
    message.status?.type === "running"
      ? ({ type: "incomplete", reason: "cancelled" } as const)
      : message.status;

  return {
    role: message.role,
    content: message.content.map((part) => {
      const type = part.type;
      switch (type) {
        case "text":
          return { type: "text", text: part.text };
        case "reasoning":
          return { type: "reasoning", text: part.text };
        case "source":
          return {
            type: "source",
            sourceType: part.sourceType,
            id: part.id,
            url: part.url,
            ...(part.title ? { title: part.title } : undefined),
          };
        case "tool-call":
          return {
            type: "tool-call",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            ...(JSON.stringify(part.args) === part.argsText
              ? { args: part.args }
              : { argsText: part.argsText }),
            ...(part.result !== undefined ? { result: part.result } : undefined),
            ...(part.isError ? { isError: true as const } : undefined),
          };
        case "image":
          return { type: "image", image: part.image };
        case "file":
          return {
            type: "file",
            data: part.data,
            mimeType: part.mimeType,
            ...(part.filename ? { filename: part.filename } : undefined),
          };
        default:
          throw new Error(`Message part type not supported by aui/v0: ${(part as { type: string }).type}`);
      }
    }),
    metadata: message.metadata as AuiV0Message["metadata"],
    ...(status ? { status } : undefined),
  };
}

export function auiV0Decode(stored: StoredMessage): {
  parentId: string | null;
  message: ThreadMessage;
} {
  const payload = stored.content as AuiV0Message;
  const like = {
    id: stored.id,
    createdAt: new Date(stored.created_at),
    ...payload,
  };
  const message = INTERNAL.fromThreadMessageLike(
    like as Parameters<typeof INTERNAL.fromThreadMessageLike>[0],
    stored.id,
    { type: "complete", reason: "unknown" }
  );

  return {
    parentId: stored.parent_id,
    message,
  };
}
