"use client";

import { useState, useCallback, useEffect, useMemo, useRef, type ComponentType } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { WorkspaceItemPicker, getCardTypeIcon } from "@/components/chat/WorkspaceItemPicker";
import { Checkbox } from "@/components/ui/checkbox";
import { useUIStore, selectReplySelections, selectSelectedCardIdsArray, selectBlockNoteSelection } from "@/lib/stores/ui-store";
import { useShallow } from "zustand/react/shallow";
import type { Item } from "@/lib/workspace-state/types";
import { useAui } from "@assistant-ui/react";
import { focusComposerInput } from "@/lib/utils/composer-utils";
import { Brain, Play, ChevronUp, ChevronDown, ChevronRight, X, Circle, CircleDot, ArrowUpIcon, ArrowLeft, Check, Folder as FolderIcon } from "lucide-react";
import { CgNotes } from "react-icons/cg";
import { PiCardsThreeBold } from "react-icons/pi";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type PromptBuilderAction =
  | "flashcards"
  | "youtube"
  | "quiz"
  | "note";

type NoteTemplate = "detailed" | "cheatsheet" | "short";

const NOTE_TEMPLATES: { id: NoteTemplate; label: string; description: string }[] = [
  { id: "detailed", label: "Detailed", description: "Comprehensive summary with key points and context." },
  { id: "cheatsheet", label: "Cheat Sheet", description: "Concise bullet points for quick reference." },
  { id: "short", label: "Concise", description: "Brief overview with essential information only." },
];

const ACTION_CONFIG: Record<
  PromptBuilderAction,
  {
    label: string;
    prefix: string;
    icon: ComponentType<{ className?: string }>;
    description: string;
    countLabel?: string;
    countPlaceholder?: string;
    defaultCount?: number;
    minCount?: number;
    maxCount?: number;
    countStep?: number;
    hasTopicSelector?: boolean;
    hasTemplates?: boolean;
    /** Override for simple input (when !hasTopicSelector) */
    inputLabel?: string;
    inputPlaceholder?: string;
    /** For YouTube: prompt when user pastes a URL */
    prefixForUrl?: string;
  }
> = {
  flashcards: {
    label: "Create Flashcard Set",
    prefix: "Make flashcards about ",
    icon: PiCardsThreeBold,
    description: "Select specific concepts and customize your flashcard set.",
    countLabel: "Number of flashcards",
    countPlaceholder: "e.g., 10",
    defaultCount: 10,
    minCount: 5,
    maxCount: 100,
    countStep: 5,
    hasTopicSelector: true,
  },
  quiz: {
    label: "Create Quiz",
    prefix: "Make a quiz on ",
    icon: Brain,
    description: "Select specific concepts and customize your quiz.",
    countLabel: "Number of questions",
    countPlaceholder: "e.g., 5",
    defaultCount: 5,
    minCount: 5,
    maxCount: 50,
    countStep: 5,
    hasTopicSelector: true,
  },
  youtube: {
    label: "Add YouTube Video",
    prefix: "Find a YouTube video on ",
    prefixForUrl: "Add this YouTube video to my workspace and summarize it.",
    icon: Play,
    description: "Enter a topic to search, or paste a YouTube link to add it to your workspace.",
    inputLabel: "Topic or YouTube link",
    inputPlaceholder: "e.g. photosynthesis... or paste a YouTube link",
  },
  note: {
    label: "Create Note",
    prefix: "Make a note on ",
    icon: CgNotes,
    description: "Select specific prompts and formats for your note.",
    hasTemplates: true,
    hasTopicSelector: true,
  },
};

interface PromptBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: PromptBuilderAction;
  items?: Item[];
  /** Called before applying the prompt. Use for e.g. expanding chat panel. */
  onBeforeSubmit?: () => void;
  /** Optional. If not provided, default behavior: set composer text, send, and focus. */
  onBuild?: (prompt: string) => void;
}

function truncate(str: string, max: number) {
  if (str.length <= max) return str;
  return str.slice(0, max).trim() + "...";
}

const YOUTUBE_URL_REGEX = /(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/[^\s]+/gi;
function extractYouTubeUrl(str: string): string | null {
  const match = str.trim().match(YOUTUBE_URL_REGEX);
  return match ? match[0] : null;
}
function isYouTubeUrl(str: string): boolean {
  return extractYouTubeUrl(str) !== null;
}

export function PromptBuilderDialog({
  open,
  onOpenChange,
  action,
  items = [],
  onBeforeSubmit,
  onBuild,
}: PromptBuilderDialogProps) {
  const config = ACTION_CONFIG[action];
  const Icon = config.icon;
  const aui = useAui();

  const replySelections = useUIStore(useShallow(selectReplySelections));
  const selectedCardIdsArray = useUIStore(useShallow(selectSelectedCardIdsArray));
  const selectedCardIds = useMemo(() => new Set(selectedCardIdsArray), [selectedCardIdsArray]);
  const blockNoteSelection = useUIStore(selectBlockNoteSelection);

  const [count, setCount] = useState(config.defaultCount ?? 10);
  const [selectedContextIds, setSelectedContextIds] = useState<Set<string>>(new Set());
  const [topicInput, setTopicInput] = useState("");
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);
  const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [noteTemplate, setNoteTemplate] = useState<NoteTemplate | null>(null);

  const topicInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Initialize state when dialog opens
  useEffect(() => {
    if (open) {
      setCount(config.defaultCount ?? 10);
      setNoteTemplate(null);
      setTopicInput("");
      setWorkspaceSearchQuery("");
      setSelectedContextIds(new Set(selectedCardIds));
      setExpandedFolders(new Set());
    } else {
      setWorkspacePickerOpen(false);
    }
  }, [open, selectedCardIds]);

  useEffect(() => {
    if (workspaceSearchQuery.trim()) {
      const allFolderIds = items.filter((i) => i.type === "folder").map((f) => f.id);
      setExpandedFolders(new Set(allFolderIds));
    } else {
      setExpandedFolders((prev) => (prev.size > 0 ? new Set() : prev));
    }
  }, [workspaceSearchQuery, items]);

  const handleToggleWorkspaceItem = useCallback((item: Item) => {
    setSelectedContextIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }, []);

  const handleToggleFolderExpand = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  // Pre-fill topic when items are selected from the picker
  useEffect(() => {
    if (selectedContextIds.size > 0 && !topicInput.trim()) {
      setTopicInput("these items");
    }
  }, [selectedContextIds.size, topicInput]);

  // Explicit focus after open: dropdown/context menu focus restoration overrides autoFocus when
  // opening from New dropdown or right-click. Defer focus so the menu has released it.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const el = document.getElementById("prompt-builder-topic") ?? topicInputRef.current;
      (el as HTMLInputElement | HTMLTextAreaElement | null)?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [open]);

  const step = config.countStep ?? 1;
  const incrementCount = useCallback(() => {
    setCount((c) => Math.min(config.maxCount ?? 100, c + step));
  }, [config.maxCount, step]);
  const decrementCount = useCallback(() => {
    setCount((c) => Math.max(config.minCount ?? 1, c - step));
  }, [config.minCount, step]);

  const builtPrompt = useMemo(() => {
    const parts: string[] = [];
    if (config.countLabel && (action === "flashcards" || action === "quiz")) {
      parts.push(`Create ${count} ${action === "flashcards" ? "flashcards" : "quiz questions"}`);
    }
    if (action === "youtube" && isYouTubeUrl(topicInput)) {
      const url = extractYouTubeUrl(topicInput)!;
      const prefix = (config as { prefixForUrl?: string }).prefixForUrl ?? "Add this YouTube video to my workspace.";
      parts.push(`${prefix} ${url}`);
    } else {
      const topicSource =
        topicInput.trim() ||
        (selectedContextIds.size > 0 ? "the selected content" : "a topic");
      parts.push(config.prefix.trim() + " " + topicSource);
    }
    if (action === "note" && config.hasTemplates && noteTemplate) {
      const tpl = NOTE_TEMPLATES.find((t) => t.id === noteTemplate);
      if (tpl?.description) parts.push(tpl.description);
    }
    return parts.join(". ");
  }, [config, action, count, topicInput, selectedContextIds.size, noteTemplate]);

  const hasValidTopic =
    (config.hasTopicSelector && (topicInput.trim().length > 0 || selectedContextIds.size > 0)) ||
    (!config.hasTopicSelector && topicInput.trim().length > 0);

  const selectMultipleCards = useUIStore((s) => s.selectMultipleCards);

  const handleSubmit = useCallback(() => {
    if (!hasValidTopic) {
      toast.error("Please enter or select a topic");
      return;
    }
    onBeforeSubmit?.();
    if (onBuild) {
      onBuild(builtPrompt);
    } else {
      // Select the chosen items in the workspace (like mention menu does)
      if (selectedContextIds.size > 0) {
        selectMultipleCards(Array.from(selectedContextIds));
      }
      aui?.composer().setText(builtPrompt);
      focusComposerInput();
    }
    onOpenChange(false);
  }, [builtPrompt, hasValidTopic, onBeforeSubmit, onBuild, aui, onOpenChange, selectedContextIds, selectMultipleCards]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (workspacePickerOpen && config.hasTopicSelector && items.length > 0) {
          e.preventDefault();
          setWorkspacePickerOpen(false);
        } else {
          onOpenChange(false);
        }
        return;
      }
      if (e.key === "Enter") {
        const isTextarea = (e.target as HTMLElement).tagName === "TEXTAREA";
        if (isTextarea) {
          if ((e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
          }
        } else {
          e.preventDefault();
          handleSubmit();
        }
      }
    },
    [handleSubmit, onOpenChange, workspacePickerOpen, config.hasTopicSelector, items.length]
  );

  const handleFormSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      handleSubmit();
    },
    [handleSubmit]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md overflow-hidden"
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        {workspacePickerOpen && config.hasTopicSelector && items.length > 0 ? (
          /* Picker view - same modal, swapped content */
          <>
            <div className="min-h-0">
              <button
                type="button"
                className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 left-4 cursor-pointer rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
                onClick={() => setWorkspacePickerOpen(false)}
                aria-label="Back"
              >
                <ArrowLeft className="size-4" />
              </button>
            </div>
            <Input
              placeholder="Search items in your workspace"
              value={workspaceSearchQuery}
              onChange={(e) => setWorkspaceSearchQuery(e.target.value)}
              className="w-full"
              autoFocus
            />
            <div className="min-h-[200px] max-h-[50vh] overflow-y-auto overflow-x-hidden rounded-md border">
              <WorkspaceItemPicker
                items={items}
                query={workspaceSearchQuery}
                selectedIds={selectedContextIds}
                onSelect={handleToggleWorkspaceItem}
                expandedFolders={expandedFolders}
                onToggleExpand={handleToggleFolderExpand}
                selectedIndicator={(isSelected) =>
                  isSelected ? (
                    <div className="w-4 h-4 rounded-full bg-primary/20 border-2 border-primary flex-shrink-0 flex items-center justify-center">
                      <Check className="size-2.5 text-primary" />
                    </div>
                  ) : undefined
                }
              />
            </div>
            <DialogFooter>
              <Button onClick={() => setWorkspacePickerOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          /* Form view */
          <form onSubmit={handleFormSubmit} className="min-w-0 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon
              className={cn(
                "size-5 shrink-0",
                action === "flashcards" && "text-purple-400",
                action === "youtube" && "text-red-500",
                action === "quiz" && "text-green-400",
                action === "note" && "text-blue-400"
              )}
            />
            {config.label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 min-w-0 overflow-x-hidden">
          {/* Note: Templates section */}
          {config.hasTemplates && (
            <div className="space-y-2">
              <div className="space-y-1.5">
                {NOTE_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setNoteTemplate((prev) => (prev === tpl.id ? null : tpl.id))}
                    className={cn(
                      "w-full flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                      noteTemplate === tpl.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    {noteTemplate === tpl.id ? (
                      <CircleDot className="size-4 shrink-0 mt-0.5 text-primary" />
                    ) : (
                      <Circle className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm">{tpl.label}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Number of flashcards / questions */}
          {config.countLabel && (
            <div className="space-y-2">
              <Label htmlFor="prompt-builder-count">{config.countLabel}</Label>
              <div className="flex items-center gap-1 rounded-md border bg-transparent">
                <Input
                  id="prompt-builder-count"
                  type="number"
                  min={config.minCount}
                  max={config.maxCount}
                  value={count}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) {
                      const step = config.countStep ?? 1;
                      const snapped = Math.round(v / step) * step;
                      const clamped = Math.min(config.maxCount ?? 100, Math.max(config.minCount ?? 1, snapped));
                      setCount(clamped);
                    }
                  }}
                  placeholder={config.countPlaceholder}
                  className="border-0 shadow-none focus-visible:ring-0"
                />
                <div className="flex flex-col pr-1">
                  <button
                    type="button"
                    onClick={incrementCount}
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    aria-label="Increase"
                  >
                    <ChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={decrementCount}
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    aria-label="Decrease"
                  >
                    <ChevronDown className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Workspace context - separate dialog for picker (scroll works, no layout shift) */}
          {config.hasTopicSelector && items.length > 0 && (
            <div className="space-y-2 min-w-0 overflow-hidden">
              <Label>Workspace context</Label>
              <Input
                placeholder={
                  selectedContextIds.size > 0
                    ? `${selectedContextIds.size} item${selectedContextIds.size === 1 ? "" : "s"} selected`
                    : "Select items from workspace..."
                }
                readOnly
                onFocus={() => setWorkspacePickerOpen(true)}
                className="w-full min-w-0 cursor-pointer"
              />
              {selectedContextIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  {items
                    .filter((i) => selectedContextIds.has(i.id))
                    .map((item) => (
                      <span
                        key={item.id}
                        className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-2.5 py-1 text-xs"
                      >
                        {item.type === "folder" ? (
                          <FolderIcon
                            className="size-3.5 shrink-0"
                            style={{ color: item.color || "#F59E0B" }}
                          />
                        ) : (
                          getCardTypeIcon(item.type)
                        )}
                        <span className="truncate max-w-[140px]">{item.name || "Untitled"}</span>
                        <button
                          type="button"
                          onClick={() => handleToggleWorkspaceItem(item)}
                          className="rounded p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Topic - free text prompt */}
          {config.hasTopicSelector && (
            <div className="space-y-2">
              <Label htmlFor="prompt-builder-topic">Topic <span className="text-destructive">*</span></Label>
              <Textarea
                id="prompt-builder-topic"
                placeholder={
                  selectedContextIds.size > 0
                    ? "e.g. key concepts, main ideas, summary..."
                    : "Describe the topic or paste content..."
                }
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                className="min-h-[80px] resize-none"
                rows={3}
              />
            </div>
          )}

          {/* Simple topic input (when no topic selector) */}
          {!config.hasTopicSelector && (
            <div className="space-y-2">
              <Label htmlFor="prompt-builder-topic">
                {config.inputLabel ?? "Topic"} <span className="text-destructive">*</span>
              </Label>
              <Input
                ref={topicInputRef as React.RefObject<HTMLInputElement>}
                id="prompt-builder-topic"
                placeholder={config.inputPlaceholder ?? "e.g. photosynthesis..."}
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
              />
            </div>
          )}

        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!hasValidTopic} className="gap-2">
            Send
            <ArrowUpIcon className="size-4" />
          </Button>
        </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
