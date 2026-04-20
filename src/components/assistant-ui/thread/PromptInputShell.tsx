"use client";

import { useCallback, useEffect, useRef, useState, type FC } from "react";
import {
  PromptBuilderDialog,
  type PromptBuilderAction,
} from "@/components/assistant-ui/PromptBuilderDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHasPromptInputText, useIsThreadEmpty, usePromptInput } from "@/lib/chat/runtime";
import { cn } from "@/lib/utils";
import { focusComposerInput } from "@/lib/utils/composer-utils";
import type { Item } from "@/lib/workspace-state/types";
import { PROMPT_INPUT_FLOATING_ACTIONS } from "./prompt-input-floating-actions";
import { PromptInput } from "./PromptInput";

interface PromptInputShellProps {
  items: Item[];
}

const FLOATING_MENU_HIDE_DELAY_MS = 400;

export const PromptInputShell: FC<PromptInputShellProps> = ({ items }) => {
  const [isHovered, setIsHovered] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const promptInput = usePromptInput();
  const [dialogAction, setDialogAction] = useState<PromptBuilderAction | null>(
    null,
  );
  const isThreadEmpty = useIsThreadEmpty();
  const hasPromptInputText = useHasPromptInputText();

  const handleDirectFill = useCallback(
    (fill: string) => {
      promptInput?.setText(fill);
      focusComposerInput(true);
    },
    [promptInput],
  );

  const handleMouseEnter = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, FLOATING_MENU_HIDE_DELAY_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  return (
    <div className="relative">
      <div
        className="relative"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className={cn(
            "absolute bottom-full left-0 right-0 z-20 flex justify-center gap-0.5 pb-2",
            "transition-opacity duration-150 ease-out",
            !isThreadEmpty && isHovered && !hasPromptInputText
              ? "opacity-100 pointer-events-auto"
              : "opacity-0 pointer-events-none",
          )}
        >
          <div className="flex flex-wrap items-center justify-center gap-0.5 rounded-xl border border-sidebar-border bg-sidebar-accent px-1.5 py-1 shadow-md dark:border-sidebar-border/15">
            {PROMPT_INPUT_FLOATING_ACTIONS.map((action) => {
              if ("subActions" in action) {
                const Icon = action.icon;
                return (
                  <DropdownMenu key={action.id}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-normal",
                          "text-sidebar-foreground transition-colors",
                          "hover:bg-sidebar-foreground/10 dark:hover:bg-sidebar-foreground/15",
                        )}
                        aria-label={action.label}
                      >
                        <Icon className={action.iconClassName} />
                        <span>{action.label}</span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="center"
                      side="top"
                      className="min-w-[140px]"
                      sideOffset={4}
                    >
                      {(action.subActions ?? []).map((sub) => {
                        const SubIcon = sub.icon;
                        return (
                          <DropdownMenuItem
                            key={sub.id}
                            onSelect={() => setDialogAction(sub.action)}
                            className="flex cursor-pointer items-center gap-2"
                          >
                            <SubIcon className={sub.iconClassName} />
                            {sub.label}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              }
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => {
                    if (action.useDialog && "action" in action && action.action) {
                      setDialogAction(action.action);
                    } else if (
                      "composerFill" in action &&
                      typeof action.composerFill === "string"
                    ) {
                      handleDirectFill(action.composerFill);
                    }
                  }}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-normal",
                    "text-sidebar-foreground transition-colors",
                    "hover:bg-sidebar-foreground/10 dark:hover:bg-sidebar-foreground/15",
                  )}
                  aria-label={action.label}
                >
                  <Icon className={action.iconClassName} />
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <PromptInput items={items} />

        {dialogAction && (
          <PromptBuilderDialog
            open={!!dialogAction}
            onOpenChange={(open) => !open && setDialogAction(null)}
            action={dialogAction}
            items={items}
          />
        )}
      </div>
    </div>
  );
};
