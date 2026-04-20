"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TextPart } from "./TextPart";

interface ReasoningPartProps {
  parts: Array<{ type: "reasoning"; text: string }>;
  isStreaming: boolean;
  threadId?: string | null;
  messageId: string;
}

function ReasoningPartImpl({ parts, isStreaming, threadId, messageId }: ReasoningPartProps) {
  const [open, setOpen] = useState(isStreaming);
  const textRef = useRef<HTMLDivElement>(null);
  const textSnapshot = useMemo(() => parts.map((part) => part.text).join("\n\n"), [parts]);

  useLayoutEffect(() => {
    if (!isStreaming || !textRef.current) return;
    const element = textRef.current;
    const fromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (fromBottom <= 80) {
      element.scrollTop = element.scrollHeight;
    }
  }, [isStreaming, textSnapshot.length]);

  useEffect(() => {
    if (isStreaming) {
      setOpen(true);
      return;
    }
    setOpen(false);
  }, [isStreaming]);

  return (
    <Collapsible open={open} onOpenChange={(nextOpen) => !isStreaming && setOpen(nextOpen)} className="group/reasoning mb-4 w-full">
      <CollapsibleTrigger className="flex max-w-[75%] items-center gap-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <span>Reasoning</span>
        <ChevronDownIcon className="size-4 transition-transform group-data-[state=closed]/reasoning:-rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden text-sm text-muted-foreground data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div ref={textRef} className="max-h-64 overflow-y-auto scroll-smooth pt-2 pb-2 pl-6 leading-relaxed">
          {parts.map((part, index) => (
            <TextPart
              key={`${messageId}-reasoning-${index}`}
              text={part.text}
              isStreaming={isStreaming && index === parts.length - 1}
              threadId={threadId}
              messageId={`${messageId}-reasoning-${index}`}
              streamingVariant="reasoning"
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export const ReasoningPart = memo(ReasoningPartImpl);
