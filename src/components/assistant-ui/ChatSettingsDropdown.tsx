"use client";

import { Settings2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUIStore } from "@/lib/stores/ui-store";
import { focusComposerInput } from "@/lib/utils/composer-utils";
import { cn } from "@/lib/utils";

export function ChatSettingsDropdown() {
  const isMemoryEnabled = useUIStore((state) => state.isMemoryEnabled);
  const toggleMemoryEnabled = useUIStore((state) => state.toggleMemoryEnabled);

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) {
          focusComposerInput();
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex cursor-pointer items-center justify-center rounded-md bg-sidebar-accent p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Chat settings"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={4}
        className="w-48"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            toggleMemoryEnabled();
          }}
          className="flex items-center justify-between gap-2"
        >
          <span className="text-sm">Memory</span>
          <div
            role="switch"
            aria-checked={isMemoryEnabled}
            className={cn(
              "relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full transition-colors",
              isMemoryEnabled ? "bg-primary" : "bg-muted",
            )}
          >
            <span
              className={cn(
                "pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform",
                isMemoryEnabled ? "translate-x-[15px]" : "translate-x-[2px]",
              )}
            />
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
