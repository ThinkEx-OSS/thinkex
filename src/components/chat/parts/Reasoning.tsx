"use client";

import { memo, useState } from "react";
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
}

// Always collapsed by default. Most users don't care about chain-of-thought
// output, and the ones who do are fine clicking the dropdown for a second.
// No auto-open on stream, no auto-collapse, no nested scroll, no
// "only show on the latest message" gate — the closed trigger is a single
// line either way, so it stays non-intrusive on old messages too.
const ReasoningImpl = ({ text, isStreaming }: ReasoningProps) => {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mb-4 w-full"
      style={
        {
          "--animation-duration": `${ANIMATION_DURATION}ms`,
        } as React.CSSProperties
      }
    >
      <CollapsibleTrigger className="group/trigger flex max-w-[75%] items-center gap-2 py-1 text-muted-foreground text-sm transition-colors hover:text-foreground">
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
        <div className="relative z-0 pt-2 pb-2 pl-6 leading-relaxed">
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
