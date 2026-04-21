"use client";

import { useCallback, useState, type FC } from "react";

import {
  PromptBuilderDialog,
  type PromptBuilderAction,
} from "@/components/chat/PromptBuilderDialog";
import { useOptionalComposer } from "@/components/chat/composer-context";
import { SUGGESTION_ACTIONS } from "@/components/chat/suggestion-actions";
import { Button } from "@/components/ui/button";
import type { Item } from "@/lib/workspace-state/types";

interface ThreadSuggestionsProps {
  items: Item[];
}

export const ThreadSuggestions: FC<ThreadSuggestionsProps> = ({ items }) => {
  const composer = useOptionalComposer();
  const [dialogAction, setDialogAction] = useState<PromptBuilderAction | null>(
    null,
  );

  const handleDirectFill = useCallback(
    (action: string) => {
      composer?.setInput(action);
      composer?.focus({ cursorAtEnd: true });
    },
    [composer],
  );

  const handleTriggerFileInput = useCallback(() => {
    document.getElementById("prompt-input-file-upload")?.click();
    composer?.focus({ cursorAtEnd: true });
  }, [composer]);

  return (
    <>
      <div className="aui-thread-welcome-suggestions grid w-full grid-cols-2 gap-2 pb-4 sm:grid-cols-3">
        {SUGGESTION_ACTIONS.map((suggestedAction, index) => {
          const Icon = suggestedAction.icon;
          return (
            <div
              key={`suggested-action-${suggestedAction.title}-${index}`}
              className="aui-thread-welcome-suggestion-display"
            >
              <Button
                type="button"
                variant="ghost"
                className="aui-thread-welcome-suggestion h-auto w-full flex-1 flex-wrap items-center justify-start gap-2 rounded-lg border border-sidebar-border px-5 py-4 text-left text-sm dark:hover:bg-accent/60"
                aria-label={suggestedAction.title}
                onClick={() => {
                  if (
                    "triggerFileInput" in suggestedAction &&
                    suggestedAction.triggerFileInput
                  ) {
                    handleTriggerFileInput();
                  } else if (
                    suggestedAction.useDialog &&
                    "action" in suggestedAction &&
                    suggestedAction.action
                  ) {
                    setDialogAction(suggestedAction.action);
                  } else if (
                    "composerFill" in suggestedAction &&
                    typeof suggestedAction.composerFill === "string"
                  ) {
                    handleDirectFill(suggestedAction.composerFill);
                  }
                }}
              >
                <Icon className={suggestedAction.iconClassName} />
                <span className="aui-thread-welcome-suggestion-text-1 font-medium">
                  {suggestedAction.title}
                </span>
              </Button>
            </div>
          );
        })}
      </div>

      {dialogAction && (
        <PromptBuilderDialog
          open={!!dialogAction}
          onOpenChange={(open) => !open && setDialogAction(null)}
          action={dialogAction}
          items={items}
        />
      )}
    </>
  );
};
