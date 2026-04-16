import { useState } from "react";
import { Settings2 } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUIStore } from "@/lib/stores/ui-store";
import { focusComposerInput } from "@/lib/utils/composer-utils";

export function ModelSettingsMenu() {
  const memoryEnabled = useUIStore((state) => state.memoryEnabled);
  const setMemoryEnabled = useUIStore((state) => state.setMemoryEnabled);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) focusComposerInput();
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Chat settings"
              className="ml-1 flex cursor-pointer items-center gap-1.5 rounded-md bg-sidebar-accent px-1.5 py-1 text-xs font-normal text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Settings2 className="size-3.5" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Chat settings</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={4}
        collisionPadding={12}
        className="w-72 p-3"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <label
                htmlFor="memory-toggle"
                className="block cursor-pointer text-sm font-medium text-foreground"
              >
                Memory
              </label>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Let ThinkEx remember facts about you across chats for more
                personalized answers.
              </p>
            </div>
            <Switch
              id="memory-toggle"
              checked={memoryEnabled}
              onCheckedChange={setMemoryEnabled}
              aria-label="Toggle memory"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
