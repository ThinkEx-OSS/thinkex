"use client";

import { useEffect, useState } from "react";
import { PartyPopper } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ShareCountBadgeProps {
  workspaceId: string;
  onClick?: () => void;
  endDate?: Date;
}

const RAFFLE_THRESHOLD = 5;
const DEFAULT_END_DATE = new Date(2026, 3, 25, 23, 59, 59);

export function ShareCountBadge({
  workspaceId,
  onClick,
  endDate = DEFAULT_END_DATE,
}: ShareCountBadgeProps) {
  const [claimCount, setClaimCount] = useState<number | null>(null);

  const isWithinWindow = Date.now() <= endDate.getTime();

  useEffect(() => {
    if (!isWithinWindow) return;

    const controller = new AbortController();
    fetch(`/api/workspaces/${workspaceId}/share-link`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.claimCount === "number") {
          setClaimCount(data.claimCount);
        }
      })
      .catch((err: unknown) => {
        if ((err as { name?: string } | null)?.name !== "AbortError") {
          console.error(err);
        }
      });

    return () => controller.abort();
  }, [workspaceId, isWithinWindow]);

  if (!isWithinWindow || claimCount === null) return null;

  const reached = claimCount >= RAFFLE_THRESHOLD;
  const label = `${claimCount}/${RAFFLE_THRESHOLD}`;
  const tooltip = reached
    ? "You're entered in the raffle!"
    : `${RAFFLE_THRESHOLD - claimCount} more ${
        RAFFLE_THRESHOLD - claimCount === 1 ? "share" : "shares"
      } to enter the raffle`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "inline-flex h-7 cursor-pointer items-center gap-1 rounded-full px-2 text-xs font-medium transition-colors",
            reached
              ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:bg-emerald-500/20 dark:text-emerald-400"
              : "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:bg-amber-500/20 dark:text-amber-400",
          )}
        >
          {reached && <PartyPopper className="h-3 w-3" />}
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
