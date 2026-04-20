"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchBranches, switchBranch } from "@/lib/chat-v2/branches";

interface BranchNavProps {
  threadId?: string | null;
  messageId: string;
  onChanged: () => Promise<void>;
  className?: string;
}

export function BranchNav({ threadId, messageId, onChanged, className }: BranchNavProps) {
  const [count, setCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [siblings, setSiblings] = useState<Array<{ id: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchBranches(threadId, messageId);
        if (cancelled) return;
        setSiblings(data.siblings);
        setCount(data.siblings.length);
        setCurrentIndex(data.currentIndex);
      } catch {
        if (!cancelled) {
          setSiblings([]);
          setCount(0);
          setCurrentIndex(0);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [messageId, threadId]);

  if (!threadId || count <= 1) return null;

  const handleSwitch = async (delta: -1 | 1) => {
    const nextIndex = (currentIndex + delta + siblings.length) % siblings.length;
    const target = siblings[nextIndex];
    if (!target) return;
    setLoading(true);
    try {
      await switchBranch(threadId, messageId, target.id);
      await onChanged();
      setCurrentIndex(nextIndex);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className ?? "inline-flex items-center text-xs text-muted-foreground"}>
      <Button variant="ghost" size="icon" className="size-6 p-1" disabled={loading} onClick={() => void handleSwitch(-1)}>
        <ChevronLeftIcon className="size-4" />
      </Button>
      <span className="font-medium">{currentIndex + 1} / {count}</span>
      <Button variant="ghost" size="icon" className="size-6 p-1" disabled={loading} onClick={() => void handleSwitch(1)}>
        <ChevronRightIcon className="size-4" />
      </Button>
    </div>
  );
}
