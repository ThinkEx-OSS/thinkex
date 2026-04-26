"use client";

import { ArrowUpIcon, Loader2, Square } from "lucide-react";
import { LuPaperclip } from "react-icons/lu";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEventHandler,
  type FC,
  type KeyboardEventHandler,
} from "react";

import { CardContextDisplay } from "@/components/chat/CardContextDisplay";
import { ReplyContextDisplay } from "@/components/chat/ReplyContextDisplay";
import { useChatContext } from "@/components/chat/ChatProvider";
import { useComposer } from "@/components/chat/composer-context";
import { AttachmentChip } from "@/components/chat/AttachmentChip";
import { TooltipIconButton } from "@/components/chat/tooltip-icon-button";
import { ModelPicker } from "@/components/chat/ModelPicker";
import { ModelSettingsMenu } from "@/components/chat/ModelSettingsMenu";
import {
  PromptBuilderDialog,
  type PromptBuilderAction,
} from "@/components/chat/PromptBuilderDialog";
import { PROMPT_INPUT_FLOATING_ACTIONS } from "@/components/chat/prompt-input-floating-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Item } from "@/lib/workspace-state/types";

interface MultimodalInputProps {
  items: Item[];
}

const MAX_TEXT_LEN = 10_000;
const FLOATING_MENU_HIDE_DELAY_MS = 400;

export const MultimodalInput: FC<MultimodalInputProps> = ({ items }) => {
  const { status, stop, messages } = useChatContext();
  const composer = useComposer();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isRunning = status === "streaming" || status === "submitted";

  // Floating actions menu (Document / Learn / YouTube / Search). Only surfaces
  // when the thread has at least one message, the input is blank, and the
  // pointer is near the composer — matches the legacy AUI prompt-input shell.
  const [dialogAction, setDialogAction] = useState<PromptBuilderAction | null>(
    null,
  );
  const [isHoveringComposer, setIsHoveringComposer] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setIsHoveringComposer(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => {
      setIsHoveringComposer(false);
    }, FLOATING_MENU_HIDE_DELAY_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  const isThreadEmpty = messages.length === 0;
  const hasComposerText = composer.input.trim().length > 0;
  const showFloatingMenu =
    !isThreadEmpty && isHoveringComposer && !hasComposerText;

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      await composer.submit();
    },
    [composer],
  );

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        if (!isRunning) {
          void handleSubmit();
        }
      }
    },
    [handleSubmit, isRunning],
  );

  const handlePaste: ClipboardEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (const item of items) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        event.preventDefault();
        void composer.addAttachments(files);
      }
    },
    [composer],
  );

  const handleFilePick = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      await composer.addAttachments(files);
      e.target.value = "";
    },
    [composer],
  );

  // Focus on mount so the user can start typing immediately. Single source
  // of truth — everyone who wants to focus the composer goes through
  // `composer.focus()` (see composer-context.tsx).
  useEffect(() => {
    composer.focus();
  }, [composer]);

  // Global "just start typing" capture: when the user types or pastes text
  // anywhere on the page while no other editable element has focus,
  // transparently focus the composer textarea and replay the input. Read
  // textarea.value directly from the DOM (not React state) to avoid stale
  // closures and unnecessary listener re-binds — React keeps the DOM value
  // in sync with `composer.input` via the controlled-input pattern.
  const setInputRef = useRef(composer.setInput);
  setInputRef.current = composer.setInput;
  const inputElRef = composer.inputRef;

  useEffect(() => {
    const isOtherEditable = (el: Element | null): boolean => {
      if (!el) return false;
      if (el === inputElRef.current) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return true;
      return (el as HTMLElement).isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.defaultPrevented) return;
      if (e.isComposing) return;
      if (e.key.length !== 1) return;

      const el = inputElRef.current;
      if (!el) return;

      const active = document.activeElement;
      if (active === el) return;
      if (isOtherEditable(active)) return;

      if (el.value.length >= MAX_TEXT_LEN) return;

      e.preventDefault();

      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next = el.value.slice(0, start) + e.key + el.value.slice(end);

      setInputRef.current(next);

      requestAnimationFrame(() => {
        const node = inputElRef.current;
        if (!node) return;
        node.focus();
        const pos = start + 1;
        node.setSelectionRange(pos, pos);
      });
    };

    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented) return;
      const el = inputElRef.current;
      if (!el) return;

      const active = document.activeElement;
      if (active === el) return;
      if (isOtherEditable(active)) return;

      const text = e.clipboardData?.getData("text");
      if (!text) return; // file-only paste falls through to other handlers

      e.preventDefault();

      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const proposed =
        el.value.slice(0, start) + text + el.value.slice(end);
      const next =
        proposed.length > MAX_TEXT_LEN
          ? proposed.slice(0, MAX_TEXT_LEN)
          : proposed;
      const insertedLen = next.length - (el.value.length - (end - start));

      setInputRef.current(next);

      requestAnimationFrame(() => {
        const node = inputElRef.current;
        if (!node) return;
        node.focus();
        const pos = start + insertedLen;
        node.setSelectionRange(pos, pos);
      });
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste);
    };
  }, [inputElRef]);

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={cn(
          "absolute bottom-full left-0 right-0 z-20 flex justify-center gap-0.5 pb-2",
          "transition-opacity duration-150 ease-out",
          showFloatingMenu
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
                  if (action.useDialog && action.action) {
                    setDialogAction(action.action);
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

      <form
        className={cn(
          "relative flex w-full flex-col rounded-lg border border-sidebar-border bg-sidebar-accent px-3.5 pt-2 pb-1 shadow-[0_9px_9px_0px_rgba(0,0,0,0.01),0_2px_5px_0px_rgba(0,0,0,0.06)] dark:border-sidebar-border/15",
        )}
        onSubmit={handleSubmit}
      >
      {composer.attachments.length > 0 && (
        <div className="mb-2 flex w-full flex-row items-center gap-2 overflow-x-auto pt-0.5 pb-1">
          {composer.attachments.map((att) => (
            <AttachmentChip
              key={att.id}
              attachment={att}
              onRemove={composer.removeAttachment}
            />
          ))}
        </div>
      )}

      <CardContextDisplay items={items} />
      <ReplyContextDisplay />

      <Textarea
        ref={composer.inputRef}
        value={composer.input}
        onChange={(e) => composer.setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder="Ask anything"
        rows={1}
        aria-label="Message input"
        maxLength={MAX_TEXT_LEN}
        className="min-h-0 max-h-32 resize-none overflow-y-auto rounded-none border-0 border-transparent bg-transparent px-0 py-1.5 text-base text-sidebar-foreground shadow-none outline-none placeholder:text-sidebar-foreground/60 focus-visible:border-transparent focus-visible:ring-0 focus:outline-none md:text-base dark:bg-transparent"
      />

      <div className="relative mb-2 flex items-center justify-between">
        <div className="relative z-0 flex items-center gap-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <label
                htmlFor="composer-file-input"
                className="flex items-center gap-1.5 rounded-md bg-sidebar-accent px-1.5 py-1 transition-colors flex-shrink-0 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
                aria-label="Add attachment"
              >
                <LuPaperclip className="w-3.5 h-3.5" />
              </label>
            </TooltipTrigger>
            <TooltipContent side="top">Add file</TooltipContent>
          </Tooltip>
          <input
            id="composer-file-input"
            ref={fileInputRef}
            type="file"
            className="sr-only"
            onChange={handleFilePick}
            multiple
            accept="image/*,.pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.heic,.heif,.avif,.tiff,.tif"
          />
          <ModelSettingsMenu />
          <div className="ml-0.5">
            <ModelPicker />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isRunning ? (
            <Button
              type="button"
              variant="default"
              size="icon"
              className="size-[34px] rounded-full border border-muted-foreground/60 hover:bg-primary/75 dark:border-muted-foreground/90"
              aria-label="Stop generating"
              onClick={() => {
                stop();
                composer.focus();
              }}
            >
              <Square className="size-3 text-background fill-current" />
            </Button>
          ) : (
            <TooltipIconButton
              tooltip={
                composer.hasUploadingAttachments
                  ? "Uploading attachments..."
                  : "Send message"
              }
              side="bottom"
              type="submit"
              variant="default"
              size="icon"
              className="size-[34px] rounded-full p-1"
              aria-label="Send message"
              disabled={composer.hasUploadingAttachments}
            >
              {composer.hasUploadingAttachments ? (
                <Loader2 className="size-4 text-background animate-spin" />
              ) : (
                <ArrowUpIcon className="size-4 text-background" />
              )}
            </TooltipIconButton>
          )}
        </div>
      </div>
      </form>

      {dialogAction && (
        <PromptBuilderDialog
          open={!!dialogAction}
          onOpenChange={(open) => !open && setDialogAction(null)}
          action={dialogAction}
          items={items}
        />
      )}
    </div>
  );
};
