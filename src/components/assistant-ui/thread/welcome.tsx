import { FileText, Upload, Brain, Play, Search } from "lucide-react";
import { FaQuoteLeft } from "react-icons/fa6";
import { PiCardsThreeBold } from "react-icons/pi";

import type { ComponentType, FC } from "react";
import { useCallback, useState } from "react";

import { useAui } from "@assistant-ui/react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PromptBuilderDialog,
  type PromptBuilderAction,
} from "@/components/assistant-ui/PromptBuilderDialog";
import { focusComposerInput } from "@/lib/utils/composer-utils";
import type { Item } from "@/lib/workspace-state/types";

type SuggestionAction = {
  title: string;
  icon: ComponentType<{ className?: string }>;
  iconClassName: string;
  action?: PromptBuilderAction;
  useDialog?: boolean;
  triggerFileInput?: boolean;
  composerFill?: string;
};

const SUGGESTION_ACTIONS: SuggestionAction[] = [
  {
    title: "Search",
    icon: Search,
    iconClassName: "size-4 shrink-0 text-sky-500",
    action: "search",
    useDialog: true,
  },
  {
    title: "Flashcards",
    icon: PiCardsThreeBold,
    iconClassName: "size-4 shrink-0 rotate-180 text-purple-400",
    action: "flashcards",
    useDialog: true,
  },
  {
    title: "YouTube",
    icon: Play,
    iconClassName: "size-4 shrink-0 text-red-500",
    action: "youtube",
    useDialog: true,
  },
  {
    title: "Upload",
    icon: Upload,
    iconClassName: "size-4 shrink-0 text-red-400",
    triggerFileInput: true,
  },
  {
    title: "Quiz",
    icon: Brain,
    iconClassName: "size-4 shrink-0 text-green-400",
    action: "quiz",
    useDialog: true,
  },
  {
    title: "Document",
    icon: FileText,
    iconClassName: "size-4 shrink-0 text-sky-400",
    action: "document",
    useDialog: true,
  },
];

interface ThreadWelcomeProps {
  items: Item[];
}

export const ThreadLoadingSkeleton: FC = () => {
  return (
    <div
      role="status"
      aria-label="Loading chat"
      className="aui-thread-loading-skeleton mx-auto flex w-full max-w-[var(--thread-max-width)] flex-col gap-6 px-2 py-8"
    >
      <div className="flex justify-end">
        <div className="max-w-[85%] space-y-2">
          <Skeleton className="h-12 w-48 rounded-lg" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full max-w-[90%] rounded" />
        <Skeleton className="h-4 w-full max-w-[70%] rounded" />
        <Skeleton className="h-4 w-32 rounded" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-10 w-64 rounded-lg" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full max-w-[95%] rounded" />
        <Skeleton className="h-4 w-full max-w-[80%] rounded" />
        <Skeleton className="h-4 w-full max-w-[60%] rounded" />
        <Skeleton className="h-4 w-24 rounded" />
      </div>
    </div>
  );
};

export const ThreadWelcome: FC<ThreadWelcomeProps> = ({ items }) => {
  return (
    <div className="aui-thread-welcome-root mx-auto my-auto flex w-full max-w-[var(--thread-max-width)] flex-grow flex-col">
      <div className="aui-thread-welcome-center flex w-full flex-grow flex-col items-center justify-center">
        <div className="aui-thread-welcome-message flex size-full flex-col justify-center px-8">
          <div className="aui-thread-welcome-message-motion-0 mb-2 mr-48 flex justify-center text-center text-6xl font-light text-muted-foreground/40">
            <FaQuoteLeft />
          </div>
          <div className="aui-thread-welcome-message-motion-1 text-center text-2xl font-light italic">
            I think, therefore I am
          </div>
          <div className="aui-thread-welcome-message-motion-2 mt-2 text-center text-lg text-muted-foreground/70">
            - Rene Descartes
          </div>
        </div>
      </div>
      <ThreadSuggestions items={items} />
    </div>
  );
};

const ThreadSuggestions: FC<ThreadWelcomeProps> = ({ items }) => {
  const aui = useAui();
  const [dialogAction, setDialogAction] = useState<PromptBuilderAction | null>(
    null,
  );

  const handleDirectFill = useCallback(
    (action: string) => {
      aui?.composer()?.setText(action);
      focusComposerInput(true);
    },
    [aui],
  );

  const handleTriggerFileInput = useCallback(() => {
    document.getElementById("composer-file-upload")?.click();
    focusComposerInput(true);
  }, []);

  return (
    <>
      <div className="aui-thread-welcome-suggestions grid w-full grid-cols-2 gap-2 pb-4 sm:grid-cols-3">
        {SUGGESTION_ACTIONS.map((suggestedAction) => {
          const Icon = suggestedAction.icon;
          return (
            <div
              key={suggestedAction.title}
              className="aui-thread-welcome-suggestion-display"
            >
              <Button
                type="button"
                variant="ghost"
                className="aui-thread-welcome-suggestion h-auto w-full flex-1 flex-wrap items-center justify-start gap-2 rounded-lg border border-sidebar-border px-5 py-4 text-left text-sm dark:hover:bg-accent/60"
                aria-label={suggestedAction.title}
                onClick={() => {
                  if (suggestedAction.triggerFileInput) {
                    handleTriggerFileInput();
                    return;
                  }

                  if (suggestedAction.useDialog && suggestedAction.action) {
                    setDialogAction(suggestedAction.action);
                    return;
                  }

                  if (suggestedAction.composerFill) {
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

      {dialogAction ? (
        <PromptBuilderDialog
          open
          onOpenChange={(open) => !open && setDialogAction(null)}
          action={dialogAction}
          items={items}
        />
      ) : null}
    </>
  );
};
