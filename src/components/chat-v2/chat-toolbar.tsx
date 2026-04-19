"use client";

import { useRouter } from "next/navigation";
import { History, MessageSquarePlus, Settings2 } from "lucide-react";
import { ModelPicker } from "@/components/assistant-ui/ModelPicker";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useUIStore } from "@/lib/stores/ui-store";
import { ChatListDropdown } from "./chat-list-dropdown";

export function ChatToolbar() {
  const router = useRouter();
  const memoryEnabled = useUIStore((s) => s.memoryEnabled);
  const setMemoryEnabled = useUIStore((s) => s.setMemoryEnabled);

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Chat settings"
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Settings2 className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">Chat settings</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" side="top" sideOffset={4} className="w-72 p-3">
            <DropdownMenuItem
              className="cursor-default items-start gap-3 rounded-md p-0 focus:bg-transparent data-[highlighted]:bg-transparent"
              onSelect={(event) => event.preventDefault()}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <label htmlFor="chat-v2-memory-toggle" className="block cursor-pointer text-sm font-medium">
                  Memory
                </label>
                <p className="text-xs leading-5 text-muted-foreground">
                  Remember facts about you across chats to personalize answers.
                </p>
              </div>
              <Switch
                id="chat-v2-memory-toggle"
                checked={memoryEnabled}
                onCheckedChange={setMemoryEnabled}
                aria-label="Toggle memory"
                className="shrink-0"
              />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ModelPicker />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="New chat"
              onClick={() => router.push(`/chat-v2/${crypto.randomUUID()}`)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <MessageSquarePlus className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">New chat</TooltipContent>
        </Tooltip>

        <ChatListDropdown
          trigger={
            <button
              type="button"
              aria-label="Chat history"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <History className="size-3.5" />
            </button>
          }
        />
      </div>
    </TooltipProvider>
  );
}
