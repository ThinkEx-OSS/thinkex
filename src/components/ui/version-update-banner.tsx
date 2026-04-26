"use client";

import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVersionChecker } from "@/hooks/ui/use-version-checker";
import { cn } from "@/lib/utils";

export function VersionUpdateBanner() {
  const { hasUpdate } = useVersionChecker();

  if (!hasUpdate) return null;

  const handleUpdate = () => {
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
          "flex items-center gap-3 rounded-full border border-white/20",
          "bg-blue-600 text-white shadow-lg shadow-blue-600/30 backdrop-blur-md",
          "pl-2 pr-1.5 py-1.5",
          "max-w-[calc(100vw-2rem)]",
        )}
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
          <Gift
            className="size-4 will-change-transform [animation:version-update-gift-sway_1.4s_ease-in-out_infinite]"
            aria-hidden
          />
        </div>
        <p className="min-w-0 truncate pr-1 text-sm font-medium text-white">
          A new version is available
        </p>
        <Button
          size="sm"
          onClick={handleUpdate}
          className="rounded-full border-0 bg-white text-blue-700 shadow-sm hover:bg-blue-50"
        >
          Update
        </Button>
      </div>
    </div>
  );
}
