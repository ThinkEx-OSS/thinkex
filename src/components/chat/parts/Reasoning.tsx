"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "lucide-react";

import { MarkdownText } from "@/components/chat/parts/MarkdownText";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const ANIMATION_DURATION = 200;

export interface ReasoningProps {
  text: string;
  /** True while this reasoning part is actively streaming. */
  isStreaming: boolean;
  /** Hide entirely once this message is no longer the latest assistant turn. */
  isLastMessage: boolean;
}

const ReasoningImpl = ({
  text,
  isStreaming,
  isLastMessage,
}: ReasoningProps) => {
  const textContainerRef = useRef<HTMLDivElement>(null);
  const [isManuallyOpen, setIsManuallyOpen] = useState(false);
  const isOpen = isStreaming || isManuallyOpen;

  // Auto-scroll within the reasoning panel as it streams.
  useEffect(() => {
    if (!isStreaming || !textContainerRef.current) return;
    const el = textContainerRef.current;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (fromBottom <= 80) {
      el.scrollTop = el.scrollHeight;
    }
  }, [isStreaming, text]);

  // Auto-collapse once streaming completes.
  useEffect(() => {
    if (!isStreaming) {
      setIsManuallyOpen(false);
    }
  }, [isStreaming]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (isStreaming && !open) return;
      setIsManuallyOpen(open);
    },
    [isStreaming],
  );

  if (!isLastMessage) return null;

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={handleOpenChange}
      className="mb-4 w-full"
      style={
        {
          "--animation-duration": `${ANIMATION_DURATION}ms`,
        } as React.CSSProperties
      }
    >
      <CollapsibleTrigger
        className={cn(
          "group/trigger flex max-w-[75%] items-center gap-2 py-1 text-muted-foreground text-sm transition-colors hover:text-foreground",
        )}
      >
        <span className="relative inline-block leading-none">
          <span>Reasoning</span>
          {isStreaming ? (
            <span
              aria-hidden
              className="shimmer pointer-events-none absolute inset-0 motion-reduce:animate-none"
            >
              Reasoning
            </span>
          ) : null}
        </span>
        <ChevronDownIcon
          className={cn(
            "mt-0.5 size-4 shrink-0 transition-transform duration-(--animation-duration) ease-out",
            "group-data-[state=closed]/trigger:-rotate-90",
            "group-data-[state=open]/trigger:rotate-0",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          "relative overflow-hidden text-muted-foreground text-sm outline-none",
          "data-[state=closed]:animate-collapsible-up",
          "data-[state=open]:animate-collapsible-down",
          "data-[state=closed]:fill-mode-forwards",
          "data-[state=closed]:pointer-events-none",
          "data-[state=open]:duration-(--animation-duration)",
          "data-[state=closed]:duration-(--animation-duration)",
        )}
        aria-busy={isStreaming}
      >
        <div
          ref={textContainerRef}
          className="relative z-0 max-h-64 overflow-y-auto scroll-smooth pt-2 pb-2 pl-6 leading-relaxed"
        >
          <MarkdownText
            text={text}
            isStreaming={isStreaming}
            streamingVariant="reasoning"
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export const Reasoning = memo(ReasoningImpl);
