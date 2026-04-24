"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { Loader2Icon } from "lucide-react";
import { useTheme } from "next-themes";

import type { ChatMessage } from "@/lib/chat/types";

/**
 * Light placeholder before a real `UIMessage` exists. Matches the same layout
 * as {@link PendingAssistantLoader} (gap / padding) so the list does not
 * jump when the assistant row (with a single Lottie) replaces this row. Using
 * one Lottie only on the real assistant message avoids the DotLottie
 * unmount+remount flash from pending → empty assistant.
 */
export function PreAssistantMessagePlaceholder() {
  return (
    <div className="flex items-center gap-3 py-2">
      <Loader2Icon
        className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
        aria-hidden
      />
      <span className="text-base text-muted-foreground">Thinking...</span>
    </div>
  );
}

/**
 * Raw "Thinking…" visual (Lottie + label). Used on the in-thread assistant
 * message while the turn is still empty; see {@link PreAssistantMessagePlaceholder}
 * for the pre-message phase.
 */
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
 * (no parts streamed yet). Mirrors the legacy Assistant UI loader.
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
      return false;
    });
  if (!isEmpty) return null;

  return <PendingAssistantLoader />;
}
