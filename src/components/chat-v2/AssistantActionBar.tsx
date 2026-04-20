"use client";

import { CheckIcon, CopyIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface AssistantActionBarProps {
  textContent: string;
  onRefresh: () => void;
}

export function AssistantActionBar({ textContent, onRefresh }: AssistantActionBarProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  return (
    <div className="flex gap-0.5 text-muted-foreground">
      <Button variant="ghost" size="icon" className="size-6 p-1" onClick={() => {
        if (!textContent) return;
        void navigator.clipboard.writeText(textContent);
        setCopied(true);
      }}>
        {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
      </Button>
      <Button variant="ghost" size="icon" className="size-6 p-1" onClick={onRefresh}>
        <RefreshCwIcon className="size-4" />
      </Button>
    </div>
  );
}
