import { useState } from "react";
import { Settings2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUIStore } from "@/lib/stores/ui-store";

export function ModelSettingsMenu() {
  const memoryEnabled = useUIStore((state) => state.memoryEnabled);
  const setMemoryEnabled = useUIStore((state) => state.setMemoryEnabled);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Chat settings"
              className="inline-flex cursor-pointer items-center justify-center rounded-md p-0 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Settings2 className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Chat settings</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={4}
        collisionPadding={12}
        className="w-72 p-3"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuItem
          className="cursor-default items-start gap-3 rounded-md p-0 focus:bg-transparent data-[highlighted]:bg-transparent"
          onSelect={(event) => event.preventDefault()}
        >
          <div className="min-w-0 flex-1 space-y-1">
            <label
              htmlFor="memory-toggle"
              className="block cursor-pointer text-sm font-medium text-foreground"
            >
              Memory
            </label>
            <p className="text-xs leading-5 text-muted-foreground">
              Remember facts about you across workspaces and chats to
              personalize answers.
            </p>
          </div>
          <Switch
            id="memory-toggle"
            checked={memoryEnabled}
            onCheckedChange={setMemoryEnabled}
            aria-label="Toggle memory"
            className="shrink-0"
          />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
