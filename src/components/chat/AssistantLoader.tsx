"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { useTheme } from "next-themes";

import type { ChatMessage } from "@/lib/chat/types";

/** Raw "Thinking…" visual (Lottie + label) for an empty in-thread assistant turn. */
export function PendingAssistantLoader() {
  const { resolvedTheme } = useTheme();
  const lottieSrc =
    resolvedTheme === "light" ? "/thinkexlight.lottie" : "/logo.lottie";

  return (
    <div className="flex items-center gap-3 py-2">
      <DotLottieReact
        src={lottieSrc}
        loop
        autoplay
        mode="bounce"
        className="w-4 h-4 self-center"
      />
      <span className="text-base text-muted-foreground">Thinking...</span>
    </div>
  );
}

interface AssistantLoaderProps {
  message: ChatMessage;
  isLastAssistant: boolean;
  isStreaming: boolean;
}

/**
 * "Thinking…" indicator shown while the latest assistant turn is still empty
 * (no parts streamed yet).
 */
export function AssistantLoader({
  message,
  isLastAssistant,
  isStreaming,
}: AssistantLoaderProps) {
  if (!isLastAssistant || !isStreaming) return null;

  const isEmpty =
    message.parts.length === 0 ||
    message.parts.every((p) => {
      if (p.type === "text") {
        return !((p as { text?: string }).text?.trim());
      }
      if (p.type === "reasoning") {
        return !((p as { text?: string }).text?.trim());
      }
      // Structural step boundary — not user-visible content; keep showing the
      // loader until real content streams in.
      if (p.type === "step-start") return true;
      // Control-channel data parts (e.g. `data-chat-title`) are invisible
      // side-effects, not in-thread content.
      if (p.type.startsWith("data-")) return true;
      return false;
    });
  if (!isEmpty) return null;

  return <PendingAssistantLoader />;
}
