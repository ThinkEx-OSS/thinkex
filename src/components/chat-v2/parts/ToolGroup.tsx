"use client";

import { memo, useEffect, useState, type PropsWithChildren } from "react";
import { ChevronDownIcon, LoaderIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { renderLegacyTool } from "./tool-shim";
import type { ChatToolPart } from "@/lib/chat-v2/types";

interface ToolGroupProps {
  parts: ChatToolPart[];
  isStreaming: boolean;
}

function ToolGroupImpl({ parts, isStreaming }: ToolGroupProps) {
  const [open, setOpen] = useState(parts.length > 1 || isStreaming);

  useEffect(() => {
    if (isStreaming) setOpen(true);
  }, [isStreaming]);

  if (parts.length === 1) {
    return <div>{renderLegacyTool(parts[0])}</div>;
  }

  return (
    <Collapsible open={open} onOpenChange={(nextOpen) => !isStreaming && setOpen(nextOpen)} className="group/tool-group w-full">
      <CollapsibleTrigger className="flex cursor-pointer items-center gap-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
        {isStreaming ? <LoaderIcon className="size-4 animate-spin" /> : null}
        <span>{isStreaming ? `Taking ${parts.length} actions` : `Took ${parts.length} actions`}</span>
        <ChevronDownIcon className="size-4 transition-transform group-data-[state=closed]/tool-group:-rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className={cn("overflow-hidden pt-2 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down")}>
        <div className="flex flex-col gap-1">{parts.map((part) => <div key={part.toolCallId}>{renderLegacyTool(part)}</div>)}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export const ToolGroup = memo(ToolGroupImpl);
