"use client";

import { Gift, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVersionChecker } from "@/hooks/ui/use-version-checker";
import { cn } from "@/lib/utils";

export function VersionUpdateBanner() {
  const { hasUpdate, dismiss } = useVersionChecker();

  if (!hasUpdate) return null;

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed top-4 left-1/2 z-[60] -translate-x-1/2",
        "animate-in fade-in slide-in-from-top-4 duration-500",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 rounded-full border border-border/60",
          "bg-background/95 backdrop-blur-md shadow-lg",
          "pl-2 pr-1.5 py-1.5",
          "max-w-[calc(100vw-2rem)]",
        )}
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Gift className="size-4 animate-bounce" />
        </div>
        <div className="flex min-w-0 flex-col pr-1 leading-tight">
          <p className="truncate text-sm font-medium text-foreground">
            A new version is available
          </p>
          <p className="truncate text-xs text-muted-foreground">
            Refresh to get the latest updates
          </p>
        </div>
        <Button size="sm" onClick={handleRefresh} className="rounded-full">
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss update notice"
          className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
