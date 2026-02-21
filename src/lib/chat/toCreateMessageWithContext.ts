import type { AppendMessage } from "@assistant-ui/react";
import {
  CreateUIMessage,
  UIDataTypes,
  UIMessage,
  UIMessagePart,
  UITools,
} from "ai";

/**
 * Custom toCreateMessage that merges runConfig (BlockNote selection, reply, selected cards)
 * into the UIMessage metadata so it persists and can be rendered when viewing message history.
 * Based on @assistant-ui/react-ai-sdk toCreateMessage with runConfig merged into metadata.
 */
export function toCreateMessageWithContext<
  UI_MESSAGE extends UIMessage = UIMessage,
>(message: AppendMessage): CreateUIMessage<UI_MESSAGE> {
  const inputParts = [
    ...message.content.filter((c) => c.type !== "file"),
    ...(message.attachments?.flatMap((a) =>
      a.content.map((c) => ({
        ...c,
        filename: a.name,
      })),
    ) ?? []),
  ];

  const parts = inputParts.map((part): UIMessagePart<UIDataTypes, UITools> => {
    switch (part.type) {
      case "text":
        return { type: "text", text: part.text };
      case "image":
        return {
          type: "file",
          url: part.image,
          ...(part.filename && { filename: part.filename }),
          mediaType: "image/png",
        };
      case "file":
        return {
          type: "file",
          url: part.data,
          mediaType: part.mimeType,
          ...(part.filename && { filename: part.filename }),
        };
      default:
        throw new Error(`Unsupported part type: ${(part as { type: string }).type}`);
    }
  });

  const runConfig = message.runConfig as Record<string, unknown> | undefined;
  const metadata = {
    ...message.metadata,
    ...(runConfig && Object.keys(runConfig).length > 0 ? runConfig : {}),
  };

  return {
    role: message.role,
    parts,
    metadata,
  } as CreateUIMessage<UI_MESSAGE>;
}
