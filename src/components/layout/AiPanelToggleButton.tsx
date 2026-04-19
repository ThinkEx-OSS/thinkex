"use client";

import { Sparkles } from "lucide-react";
import { formatKeyboardShortcut } from "@/lib/utils/keyboard-shortcut";
import { cn } from "@/lib/utils";

interface AiPanelToggleButtonProps {
  isDesktop: boolean;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
}

export default function AiPanelToggleButton({
  isDesktop,
  isExpanded,
  setIsExpanded,
}: AiPanelToggleButtonProps) {
  if (!isDesktop || isExpanded) {
    return null;
  }

  return (
    <button
      onClick={() => setIsExpanded(true)}
      className={cn(
        "inline-flex items-center gap-2 h-8 px-2 outline-none rounded-md text-sm pointer-events-auto whitespace-nowrap relative cursor-pointer box-border",
        "border border-sidebar-border text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-accent transition-colors",
      )}
      aria-label={`Open AI panel (${formatKeyboardShortcut("J")})`}
      title={`Open AI panel (${formatKeyboardShortcut("J")})`}
    >
      <Sparkles className="h-4 w-4" />
      AI
    </button>
  );
}
