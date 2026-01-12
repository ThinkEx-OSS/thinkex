"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkspaceSaveIndicatorProps {
  isSaving: boolean;
  lastSavedAt: Date | null;
  hasUnsavedChanges?: boolean;
  onManualSave?: () => void;
  currentWorkspaceId?: string | null;
  onShowHistory?: () => void;
}

export default function WorkspaceSaveIndicator({
  isSaving,
  lastSavedAt,
  hasUnsavedChanges = false,
  onManualSave,
  currentWorkspaceId,
  onShowHistory,
}: WorkspaceSaveIndicatorProps) {
  const [timeSinceLastSave, setTimeSinceLastSave] = useState<string>("");

  // Update time since last save every second
  useEffect(() => {
    if (!lastSavedAt) {
      setTimeSinceLastSave("");
      return;
    }

    const updateTime = () => {
      const now = new Date();
      const savedTime = lastSavedAt.getTime();

      // Validate that the date is valid
      if (isNaN(savedTime)) {
        setTimeSinceLastSave("");
        return;
      }

      const diffMs = now.getTime() - savedTime;
      const diffSeconds = Math.floor(diffMs / 1000);
      const diffMinutes = Math.floor(diffSeconds / 60);
      const diffHours = Math.floor(diffSeconds / 3600);
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diffWeeks = Math.floor(diffDays / 7);
      const diffMonths = Math.floor(diffDays / 30);

      if (diffSeconds < 5) {
        setTimeSinceLastSave("just now");
      } else if (diffSeconds < 60) {
        setTimeSinceLastSave(`${diffSeconds}s ago`);
      } else if (diffSeconds < 3600) {
        setTimeSinceLastSave(`${diffMinutes}m ago`);
      } else if (diffHours < 24) {
        setTimeSinceLastSave(`${diffHours}h ago`);
      } else if (diffDays < 7) {
        setTimeSinceLastSave(`${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`);
      } else if (diffDays < 30) {
        // Show weeks, but if less than 2 weeks, show days instead
        if (diffDays < 14) {
          setTimeSinceLastSave(`${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`);
        } else {
          setTimeSinceLastSave(`${diffWeeks} ${diffWeeks === 1 ? 'week' : 'weeks'} ago`);
        }
      } else if (diffDays < 365) {
        setTimeSinceLastSave(`${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`);
      } else {
        // For very old saves (1+ year), show months
        setTimeSinceLastSave(`${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, [lastSavedAt]);

  // Show minimal indicator when no workspace
  if (!currentWorkspaceId) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
        <CloudOff className="h-3 w-3" />
        <span>No workspace</span>
      </div>
    );
  }

  const handleClick = () => {
    if (onShowHistory) {
      onShowHistory();
    } else if (onManualSave && !isSaving) {
      onManualSave();
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isSaving}
      className={cn(
        "inline-flex items-center gap-2 h-8 px-2 outline-none rounded-md text-xs pointer-events-auto whitespace-nowrap relative cursor-pointer box-border",
        "text-sidebar-foreground/50 hover:text-sidebar-foreground/70 hover:bg-sidebar-accent transition-colors",
        (isSaving) && "cursor-default"
      )}
      title={onShowHistory ? "Click to view version history" : onManualSave ? "Click to save now" : undefined}
    >
      {isSaving ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-sidebar-foreground/50" />
          <span className="text-xs text-sidebar-foreground/50">Saving...</span>
        </>
      ) : hasUnsavedChanges ? (
        <>
          <Cloud className="h-4 w-4 text-sidebar-foreground/50" />
          <span className="text-xs text-sidebar-foreground/50">Unsaved changes</span>
        </>
      ) : lastSavedAt ? (
        <>
          <span className="text-xs text-sidebar-foreground/50">
            Saved {timeSinceLastSave}
          </span>
        </>
      ) : (
        <>
          <CloudOff className="h-4 w-4 text-sidebar-foreground/50" />
          <span className="text-xs text-sidebar-foreground/50">Not saved</span>
        </>
      )}
    </button>
  );
}

