"use client";

import { CheckIcon, CopyIcon, PencilIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface UserActionBarProps {
  textContent: string;
  onEdit: () => void;
}

export function UserActionBar({ textContent, onEdit }: UserActionBarProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  return (
    <div className="flex gap-1 text-muted-foreground">
      <Button variant="ghost" size="icon" className="size-6 p-1" onClick={() => {
        if (!textContent) return;
        void navigator.clipboard.writeText(textContent);
        setCopied(true);
      }}>
        {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
      </Button>
      <Button variant="ghost" size="icon" className="size-6 p-1" onClick={onEdit}>
        <PencilIcon className="size-4" />
      </Button>
    </div>
  );
}
