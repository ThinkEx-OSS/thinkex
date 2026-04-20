import type { ChatMessagePart, ChatToolPart } from "@/lib/chat-v2/types";

type ReasoningSegment = { kind: "reasoning"; parts: Extract<ChatMessagePart, { type: "reasoning" }>[] };
type ToolSegment = { kind: "tools"; parts: ChatToolPart[] };
type PartSegment = { kind: "part"; part: ChatMessagePart };

export type GroupedPart = ReasoningSegment | ToolSegment | PartSegment;

export function groupParts(parts: ChatMessagePart[]): GroupedPart[] {
  const grouped: GroupedPart[] = [];

  for (const part of parts) {
    const previous = grouped.at(-1);

    if (part.type === "reasoning") {
      if (previous?.kind === "reasoning") {
        previous.parts.push(part);
      } else {
        grouped.push({ kind: "reasoning", parts: [part] });
      }
      continue;
    }

    if (part.type.startsWith("tool-")) {
      if (previous?.kind === "tools") {
        previous.parts.push(part as ChatToolPart);
      } else {
        grouped.push({ kind: "tools", parts: [part as ChatToolPart] });
      }
      continue;
    }

    grouped.push({ kind: "part", part });
  }

  return grouped;
}
