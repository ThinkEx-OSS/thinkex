import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  CheckCircle2,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CopyIcon,
  FileText,
  PencilIcon,
  PlusSquareIcon,
  RefreshCwIcon,
  Square,
  SearchIcon,
  GalleryHorizontalEnd,
  Code as CodeIcon,
  AlertTriangle,
  Sparkles,
  Globe,
  Bug,
} from "lucide-react";
import { FaQuoteLeft, FaWandMagicSparkles, FaCheck } from "react-icons/fa6";
import { LuSparkle } from "react-icons/lu";
import { cn } from "@/lib/utils";
import {
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useMessagePartText,
  useAuiState,
} from "@assistant-ui/react";


import type { FC } from "react";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import * as m from "motion/react-m";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import Link from "next/link";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { CreateQuizToolUI } from "@/components/assistant-ui/CreateQuizToolUI";
import { UpdateQuizToolUI } from "@/components/assistant-ui/UpdateQuizToolUI";
import { CreateNoteToolUI } from "@/components/assistant-ui/CreateNoteToolUI";
import { CreateFlashcardToolUI } from "@/components/assistant-ui/CreateFlashcardToolUI";
import { UpdateFlashcardToolUI } from "@/components/assistant-ui/UpdateFlashcardToolUI";

import { YouTubeSearchToolUI } from "@/components/assistant-ui/YouTubeSearchToolUI";
import { AddYoutubeVideoToolUI } from "@/components/assistant-ui/AddYoutubeVideoToolUI";
import { ExecuteCodeToolUI } from "@/components/assistant-ui/ExecuteCodeToolUI";
import { FileProcessingToolUI } from "@/components/assistant-ui/FileProcessingToolUI";
import { URLContextToolUI } from "@/components/assistant-ui/URLContextToolUI";
import { DeepResearchToolUI } from "@/components/assistant-ui/DeepResearchToolUI";
import { UpdateNoteToolUI } from "@/components/assistant-ui/UpdateNoteToolUI";
import { WebSearchToolUI } from "@/components/assistant-ui/WebSearchToolUI";

import { DeleteCardToolUI } from "@/components/assistant-ui/DeleteCardToolUI";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import {
  ComposerAttachments,
  ComposerAddAttachment,
  UserMessageAttachments
} from "@/components/assistant-ui/attachment";
import { SelectCardsToolUI } from "@/components/assistant-ui/SelectCardsToolUI";
import { AssistantLoader } from "@/components/assistant-ui/assistant-loader";
import { File as FileComponent } from "@/components/assistant-ui/file";
import { Sources } from "@/components/assistant-ui/sources";
import { Image } from "@/components/assistant-ui/image";
import { Reasoning, ReasoningGroup } from "@/components/assistant-ui/reasoning";
import { ToolGroup } from "@/components/assistant-ui/tool-group";

import type { Item, PdfData } from "@/lib/workspace-state/types";
import { CardContextDisplay } from "@/components/chat/CardContextDisplay";
import { ReplyContextDisplay } from "@/components/chat/ReplyContextDisplay";
import { MentionMenu } from "@/components/chat/MentionMenu";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useUIStore, selectReplySelections, selectSelectedCardIdsArray } from "@/lib/stores/ui-store";
import { DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { useShallow } from "zustand/react/shallow";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCreateCardFromMessage } from "@/hooks/ai/use-create-card-from-message";
import { extractUrls, createUrlFile } from "@/lib/attachments/url-utils";
import { filterItems } from "@/lib/workspace-state/search";
import { useSession } from "@/lib/auth-client";
import { formatSelectedCardsContext } from "@/lib/utils/format-workspace-context";
import { focusComposerInput } from "@/lib/utils/composer-utils";
import { SpeechToTextButton } from "@/components/assistant-ui/SpeechToTextButton";

// Available AI models
const AI_MODELS = [
  { id: "gemini-3-pro-preview", name: "Gemini 3 Pro", description: "Latest preview model" },
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", description: "Latest fast preview model" },
  { id: "gemini-flash-lite-latest", name: "Gemini Flash Lite", description: "Fastest & cost-efficient" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Powerful & reliable" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Fast & efficient" },
];

interface ThreadProps {
  items?: Item[];
}

export const Thread: FC<ThreadProps> = ({ items = [] }) => {
  const viewportRef = useRef<HTMLDivElement>(null);

  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        {/* Register tool UI - this component mounts and registers the UI with the assistant runtime */}
        <CreateQuizToolUI />
        <UpdateQuizToolUI />
        <CreateNoteToolUI />
        <CreateFlashcardToolUI />
        <UpdateFlashcardToolUI />
        <UpdateNoteToolUI />

        <DeleteCardToolUI />
        <SelectCardsToolUI />

        <YouTubeSearchToolUI />
        <AddYoutubeVideoToolUI />
        <ExecuteCodeToolUI />
        <FileProcessingToolUI />
        <URLContextToolUI />
        <DeepResearchToolUI />
        <WebSearchToolUI />
        <ThreadPrimitive.Root
          className="aui-root aui-thread-root @container flex h-full flex-col bg-sidebar"
          style={{
            ["--thread-max-width" as string]: "50rem",
          }}
        >
          <ThreadPrimitive.Viewport
            ref={viewportRef}
            turnAnchor="top"
            autoScroll={false}
            className="aui-thread-viewport relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll px-4"
          >
            <AuiIf condition={({ thread }) => thread.isEmpty}>
              <ThreadWelcome />
            </AuiIf>

            <ThreadPrimitive.Messages
              components={{
                UserMessage,
                EditComposer,
                AssistantMessage,
              }}
            />

            <ThreadPrimitive.ViewportFooter className="aui-thread-viewport-footer sticky bottom-0 mx-auto mt-auto flex w-full max-w-[var(--thread-max-width)] flex-col gap-4 overflow-visible rounded-t-3xl bg-sidebar pb-3 md:pb-4">
              <ThreadScrollToBottom />
              <Composer items={items} />
            </ThreadPrimitive.ViewportFooter>
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </MotionConfig>
    </LazyMotion>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className={cn(
          "aui-thread-scroll-to-bottom absolute -top-12 z-10 self-center rounded-xl p-4 disabled:invisible",
          "bg-white/5 border-white/10 text-white/60",
          "hover:border-white/20 hover:bg-white/10 hover:text-white",
          "shadow-none",
          "transition-[background-color,border-color,box-shadow,color] duration-300 ease-out"
        )}
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <div className="aui-thread-welcome-root mx-auto my-auto flex w-full max-w-[var(--thread-max-width)] flex-grow flex-col">
      <div className="aui-thread-welcome-center flex w-full flex-grow flex-col items-center justify-center">
        <div className="aui-thread-welcome-message flex size-full flex-col justify-center px-8">
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="aui-thread-welcome-message-motion-0 text-6xl font-light text-muted-foreground/40 text-center mb-2 flex justify-center mr-48"
          >
            <FaQuoteLeft />
          </m.div>
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ delay: 0.05 }}
            className="aui-thread-welcome-message-motion-1 text-2xl font-light italic text-center"
          >
            I think, therefore I am
          </m.div>
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ delay: 0.1 }}
            className="aui-thread-welcome-message-motion-2 text-lg text-muted-foreground/70 text-center mt-2"
          >
            — René Descartes
          </m.div>
        </div>
      </div>
      <ThreadSuggestions />
    </div>
  );
};

const ThreadSuggestions: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestions grid w-full gap-2 pb-4 @md:grid-cols-2">
      {[
        {
          title: "Summarize my paper",
          label: "and extract findings",
          action: "Summarize my paper and extract findings",
        },
        {
          title: "Create notes",
          label: "based on my lecture slides",
          action: "Create notes based on my lecture slides",
        },
        {
          title: "Read my PDF",
          label: "and pull out key points",
          action: "Read my PDF",
        },
        {
          title: "Make flashcards",
          label: "from this YouTube video",
          action: "Make flashcards from this YouTube video",
        },
      ].map((suggestedAction, index) => (
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.05 * index }}
          key={`suggested-action-${suggestedAction.title}-${index}`}
          className="aui-thread-welcome-suggestion-display [&:nth-child(n+3)]:hidden @md:[&:nth-child(n+3)]:block"
        >
          <ThreadPrimitive.Suggestion
            prompt={suggestedAction.action}
            send
            asChild
          >
            <Button
              variant="ghost"
              className="aui-thread-welcome-suggestion h-auto w-full flex-1 flex-wrap items-start justify-start gap-1 rounded-lg border border-sidebar-border px-5 py-4 text-left text-sm @md:flex-col dark:hover:bg-accent/60"
              aria-label={suggestedAction.action}
            >
              <span className="aui-thread-welcome-suggestion-text-1 font-medium">
                {suggestedAction.title}
              </span>
              <span className="aui-thread-welcome-suggestion-text-2 text-muted-foreground">
                {suggestedAction.label}
              </span>
            </Button>
          </ThreadPrimitive.Suggestion>
        </m.div>
      ))}
    </div>
  );
};

interface ComposerProps {
  items: Item[];
}

const Composer: FC<ComposerProps> = ({ items }) => {
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const aui = useAui();
  const replySelections = useUIStore(useShallow(selectReplySelections));
  const clearReplySelections = useUIStore((state) => state.clearReplySelections);
  const clearSelectedActions = useUIStore((state) => state.clearSelectedActions);
  const selectedCardIdsArray = useUIStore(useShallow(selectSelectedCardIdsArray));
  const selectedCardIds = useMemo(() => new Set(selectedCardIdsArray), [selectedCardIdsArray]);
  const queryClient = useQueryClient();

  // Get workspace state and operations for PDF card creation
  const { state: workspaceState } = useWorkspaceState(currentWorkspaceId);
  const operations = useWorkspaceOperations(currentWorkspaceId, workspaceState);

  // Debounce refetch timeout map (similar to CreateNoteToolUI pattern)
  const refetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const selectedActions = useUIStore((state) => state.selectedActions);

  // Watch for thread changes to auto-focus composer (built-in assistant-ui behavior)
  const mainThreadId = useAuiState(({ threads }) => (threads as any)?.mainThreadId);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-focus composer when thread changes
  useEffect(() => {
    if (mainThreadId && inputRef.current) {
      // Small delay to ensure DOM is ready after thread switch
      const timeoutId = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [mainThreadId]);

  // Mention menu state
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const toggleCardSelection = useUIStore((state) => state.toggleCardSelection);

  // Handle input changes for @ mention detection
  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const value = textarea.value;
    const cursorPos = textarea.selectionStart ?? 0;

    // Check if we're currently tracking a mention
    if (mentionStartIndex !== null) {
      // Extract the query from @ to cursor
      const query = value.slice(mentionStartIndex + 1, cursorPos);

      // Check if we've moved before the @ or if there's a space/newline after @
      if (cursorPos <= mentionStartIndex || query.includes(' ') || query.includes('\n')) {
        setMentionMenuOpen(false);
        setMentionStartIndex(null);
        setMentionQuery("");
      } else {
        setMentionQuery(query);
      }
    }
  }, [mentionStartIndex]);

  // Handle keydown for @ detection and menu control
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;

    // Detect @ key
    if (e.key === '@' && !mentionMenuOpen) {
      const cursorPos = textarea.selectionStart ?? 0;
      // Check if @ is at start or preceded by whitespace
      const charBefore = cursorPos > 0 ? textarea.value[cursorPos - 1] : ' ';
      if (charBefore === ' ' || charBefore === '\n' || cursorPos === 0) {
        setMentionMenuOpen(true);
        setMentionStartIndex(cursorPos);
        setMentionQuery("");
      }
    }

    // Close menu on Escape
    if (e.key === 'Escape' && mentionMenuOpen) {
      e.preventDefault();
      setMentionMenuOpen(false);
      setMentionStartIndex(null);
      setMentionQuery("");
    }

    // Prevent default behavior when menu is open for arrow keys and Enter
    if (mentionMenuOpen && ['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) {
      e.preventDefault();
    }
  }, [mentionMenuOpen]);

  // Clear the @query from input (extracted for reuse)
  const clearMentionQuery = useCallback(() => {
    if (mentionStartIndex !== null && inputRef.current) {
      const textarea = inputRef.current;
      const currentValue = textarea.value;

      // Calculate what to remove: from the @ symbol to current cursor/end of query
      const atSymbolIndex = mentionStartIndex;

      // Find where the query ends (current text after @ until space/newline or end)
      let queryEndIndex = mentionStartIndex;
      while (queryEndIndex < currentValue.length &&
        currentValue[queryEndIndex] !== ' ' &&
        currentValue[queryEndIndex] !== '\n') {
        queryEndIndex++;
      }

      const textBefore = currentValue.substring(0, atSymbolIndex);
      const textAfter = currentValue.substring(queryEndIndex);

      // Set the new value without the @query
      const newValue = textBefore + textAfter;

      // Update the textarea value
      aui?.composer()?.setText(newValue);

      // Reset mention state
      setMentionQuery("");
      setMentionStartIndex(null);

      // Focus and position cursor at where the @ was
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const newCursorPos = textBefore.length;
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    }
  }, [mentionStartIndex, aui]);

  // Handle mention selection - select item and close menu
  const handleMentionSelect = useCallback((item: Item) => {
    // Toggle item in context
    toggleCardSelection(item.id);
    // Clear the @query from input and close menu
    clearMentionQuery();
    setMentionMenuOpen(false);
  }, [toggleCardSelection, clearMentionQuery]);

  // Handle mention menu close - remove the @query from input
  const handleMentionMenuClose = useCallback((open: boolean) => {
    if (!open) {
      clearMentionQuery();
    }
    setMentionMenuOpen(open);
  }, [clearMentionQuery]);

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData || !currentWorkspaceId) return;

    // Check if clipboard contains files (images or other file types)
    const files = Array.from(clipboardData.files) as File[];

    if (files.length > 0) {
      e.preventDefault();
      // Add the first file (or prioritize images if multiple files) as an attachment
      // It will be uploaded when the message is sent
      const imageFile = files.find((file: File) => file.type.startsWith('image/'));
      const fileToUpload = imageFile || files[0];

      if (fileToUpload) {
        try {
          await aui?.composer()?.addAttachment(fileToUpload);
        } catch (error) {
          console.error("Failed to add file attachment:", error);
        }
      }
      return;
    }

    // Also check clipboard items for image data (e.g., screenshots)
    const clipboardItems = Array.from(clipboardData.items) as DataTransferItem[];
    const imageItem = clipboardItems.find((item: DataTransferItem) => item.type.startsWith('image/'));

    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) {
        try {
          // Add as attachment - will be uploaded when message is sent
          await aui?.composer()?.addAttachment(file);
        } catch (error) {
          console.error("Failed to add image attachment:", error);
        }
      }
      return;
    }

    // Check if clipboard contains a URL
    const pastedText = clipboardData.getData('text/plain');
    if (pastedText) {
      // Extract URLs from the pasted text
      const urls = extractUrls(pastedText);

      if (urls.length > 0) {
        // Always prevent default paste behavior when URLs are detected
        e.preventDefault();

        // Add each valid URL as an attachment
        for (const url of urls) {
          try {
            // Create a virtual File object from the URL
            const urlFile = createUrlFile(url);
            // Add it as an attachment
            await aui?.composer()?.addAttachment(urlFile);
          } catch (error) {
            console.error("Failed to add URL attachment:", error);
          }
        }

        // Remove URLs from the text and insert the cleaned text
        let cleanedText = pastedText;
        for (const url of urls) {
          cleanedText = cleanedText.replace(url, '').trim();
        }

        // Clean up extra whitespace
        cleanedText = cleanedText.replace(/\s+/g, ' ').trim();

        // If there's remaining text after removing URLs, insert it
        if (cleanedText) {
          // Get the current composer input element
          const composerInput = e.target as HTMLTextAreaElement;
          const start = composerInput.selectionStart || 0;
          const end = composerInput.selectionEnd || 0;
          const currentValue = composerInput.value;

          // Insert the cleaned text at the cursor position
          const newValue = currentValue.slice(0, start) + cleanedText + currentValue.slice(end);
          composerInput.value = newValue;

          // Set cursor position after the inserted text
          const newCursorPos = start + cleanedText.length;
          composerInput.setSelectionRange(newCursorPos, newCursorPos);

          // Trigger input event to update the composer state
          const inputEvent = new Event('input', { bubbles: true });
          composerInput.dispatchEvent(inputEvent);
        }

        return;
      }
    }
  };

  return (
    <ComposerPrimitive.Root
      className="aui-composer-root relative flex w-full flex-col rounded-lg border border-sidebar-border bg-sidebar-accent px-1 pt-1 shadow-[0_9px_9px_0px_rgba(0,0,0,0.01),0_2px_5px_0px_rgba(0,0,0,0.06)] dark:border-sidebar-border/15"
      onClick={(e) => {
        // Focus the input when clicking anywhere in the composer area
        // This allows users to easily return focus after interacting with quizzes or other cards
        if (inputRef.current && !e.defaultPrevented) {
          inputRef.current.focus();
        }
      }}
      onSubmit={async (e) => {
        e.preventDefault();

        // Get the current composer state
        const composerState = aui?.composer()?.getState();
        if (!composerState) return;

        const currentText = composerState.text;
        const attachments = composerState.attachments || [];

        // Prevent empty messages
        if (!currentText.trim() && attachments.length === 0) {
          return;
        }

        // Detect PDF attachments and create cards before sending message
        const pdfAttachments = attachments.filter((att) => {
          const file = att.file;
          return file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
        });

        if (pdfAttachments.length > 0 && currentWorkspaceId) {
          try {
            // Upload all PDFs first (can still use Promise.all for uploads)
            const uploadPromises = pdfAttachments.map(async (attachment) => {
              const file = attachment.file;
              if (!file) return null;

              // Upload file to Supabase
              const formData = new FormData();
              formData.append('file', file);

              const uploadResponse = await fetch('/api/upload-file', {
                method: 'POST',
                body: formData,
              });

              if (!uploadResponse.ok) {
                throw new Error(`Failed to upload PDF: ${uploadResponse.statusText}`);
              }

              const { url: fileUrl, filename } = await uploadResponse.json();

              return {
                fileUrl,
                filename: filename || file.name,
                fileSize: file.size,
                name: file.name.replace(/\.pdf$/i, ''),
              };
            });

            const uploadResults = await Promise.all(uploadPromises);

            // Filter out any null results (files that couldn't be processed)
            const validResults = uploadResults.filter((result): result is NonNullable<typeof result> => result !== null);

            if (validResults.length > 0) {
              // Collect all PDF card data and create in a single batch event
              const pdfCardDefinitions = validResults.map((result) => {
                const pdfData: Partial<PdfData> = {
                  fileUrl: result.fileUrl,
                  filename: result.filename,
                  fileSize: result.fileSize,
                };

                return {
                  type: 'pdf' as const,
                  name: result.name,
                  initialData: pdfData,
                };
              });

              // Create all PDF cards atomically in a single event
              operations.createItems(pdfCardDefinitions);

              // Debounced refetch of workspace events (same pattern as CreateNoteToolUI)
              if (refetchTimeoutRef.current) {
                clearTimeout(refetchTimeoutRef.current);
              }

              refetchTimeoutRef.current = setTimeout(() => {
                if (currentWorkspaceId) {
                  queryClient.refetchQueries({
                    queryKey: ["workspace", currentWorkspaceId, "events"],
                  });
                }
                refetchTimeoutRef.current = null;
              }, 100);
            }
          } catch (error) {
            console.error('Error creating PDF cards:', error);
            toast.error('Failed to create PDF cards');
          }
        }

        // Get selected cards for context
        const selectedItems = items.filter((item) => selectedCardIds.has(item.id));

        // Combine all context: selected cards, reply texts, and user message
        let modifiedText = currentText;

        // Set the modified text and send
        aui?.composer()?.setText(modifiedText);
        aui?.composer()?.send();

        // Clear reply selections immediately (these are added to the message itself)
        clearReplySelections();

        // Delay clearing selected actions to ensure they're included in the API request
        // The useAssistantInstructions hook needs the actions to be available when the request is made
        setTimeout(() => {
          clearSelectedActions();
        }, 500);

        // Note: BlockNote selection is not cleared automatically - it persists until manually cleared
      }}
    >
      {/* Attachment Display - shows uploaded files */}
      <ComposerAttachments />
      {/* Card Context Display - shows selected cards inside input area */}
      <CardContextDisplay items={items} />
      {/* Reply Context Display - shows reply selections */}
      <ReplyContextDisplay />
      <div className="relative">
        <ComposerPrimitive.Input
          ref={inputRef}
          placeholder="Ask anything or @mention context"
          className="aui-composer-input max-h-32 w-full resize-none bg-transparent px-3.5 py-1.5 text-base text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/60 focus:outline-sidebar-border focus:ring-2 focus:ring-sidebar-border/50"
          rows={1}
          autoFocus
          aria-label="Message input"
          maxLength={10000}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
        />
        {/* Mention Menu */}
        <MentionMenu
          open={mentionMenuOpen}
          onOpenChange={handleMentionMenuClose}
          query={mentionQuery}
          items={items}
          onSelect={handleMentionSelect}
          selectedCardIds={selectedCardIds}
        />
      </div>
      <ComposerAction items={items} />
    </ComposerPrimitive.Root>
  );
};

interface ComposerActionProps {
  items: Item[];
}

const ComposerAction: FC<ComposerActionProps> = ({ items }) => {
  const { data: session } = useSession();
  useAui();
  const isAnonymous = session?.user?.isAnonymous ?? false;
  const selectedCardIdsArray = useUIStore(
    useShallow(selectSelectedCardIdsArray)
  );
  const selectedCardIds = useMemo(() => new Set(selectedCardIdsArray), [selectedCardIdsArray]);
  const toggleCardSelection = useUIStore((state) => state.toggleCardSelection);

  const selectedIds = useUIStore((state) => state.selectedActions);
  const setSelectedActions = useUIStore((state) => state.setSelectedActions);
  const [isWarningPopoverOpen, setIsWarningPopoverOpen] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Model selector state
  const selectedModelId = useUIStore((state) => state.selectedModelId);
  const setSelectedModelId = useUIStore((state) => state.setSelectedModelId);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);

  const selectedModel = useMemo(
    () => AI_MODELS.find((m) => m.id === selectedModelId) || AI_MODELS[1],
    [selectedModelId]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Filter items for the dropdown based on selected tags
  const filteredItems = useMemo(() => {
    return filterItems(items, "");
  }, [items]);

  // Action items
  const actionItems = [
    {
      id: "manage-workspace",
      label: "Edit Workspace",
      description: "Create, update, and organize content",
      icon: <PencilIcon className="size-3.5" />,
      onClick: () => {
        // Placeholder for manage workspace action
      },
    },
    {
      id: "search-web",
      label: "Search Web",
      description: "Search the web and attach links as context",
      icon: <SearchIcon className="size-3.5" />,
      onClick: () => {
        // Placeholder for search web action
      },
    },
    {
      id: "run-code",
      label: "Analyze (Run Code)",
      description: "Runs Python code for calculations and analysis",
      icon: <CodeIcon className="size-3.5" />,
      onClick: () => {
        // Placeholder for run code action
      },
    },
    {
      id: "deep-research",
      label: "Deep Research",
      description: "Comprehensive research using multiple sources",
      icon: <Globe className="size-3.5" />,
      onClick: () => {
        // Toggle behavior is handled by handleActionClick
        // Only set text if we are selecting it (not waiting to be deselected)
        const isCurrentlySelected = selectedIds.includes("deep-research");
        if (!isCurrentlySelected) {

        }
      },
    },
  ];

  const handleActionClick = (itemId: string) => {
    // Only allow one action to be selected at a time
    // If clicking the same action, deselect it; otherwise, select only this action
    const newSelectedIds = selectedIds.includes(itemId)
      ? [] // Deselect if already selected
      : [itemId]; // Select only this action (replaces any previously selected)

    setSelectedActions(newSelectedIds);

    // Call the item's onClick handler if provided
    const item = actionItems.find((i) => i.id === itemId);
    item?.onClick?.();

    // Focus the composer input after action selection
    focusComposerInput();
  };

  const isActionSelected = (itemId: string) => selectedIds.includes(itemId);
  const selectedAction = selectedIds.length > 0
    ? actionItems.find((item) => item.id === selectedIds[0]) || null
    : null;

  return (
    <div className="aui-composer-action-wrapper relative mx-1 mb-2 flex items-center justify-between">
      {/* Attachment buttons on the left */}
      <div className="flex items-center gap-1 relative z-0">
        <div className="relative z-0">
          <ComposerAddAttachment />
        </div>
        {/* Actions Button */}
        <DropdownMenu onOpenChange={(open) => {
          if (!open) {
            focusComposerInput();
          }
        }}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-sidebar-accent hover:bg-accent transition-colors flex-shrink-0 text-xs font-normal cursor-pointer",
                selectedAction ? "text-white" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {selectedAction ? selectedAction.icon : <ChevronUpIcon className="w-3.5 h-3.5" />}
              <span>{selectedAction ? selectedAction.label : "Actions"}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-48 max-h-80 overflow-y-auto" onCloseAutoFocus={(e) => e.preventDefault()}>
            {actionItems.map((item) => {
              const selected = isActionSelected(item.id);
              return (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => {
                    handleActionClick(item.id);
                  }}
                  title={item.description}
                  aria-label={item.description ?? item.label}
                  className={cn(
                    "cursor-pointer",
                    selected && "bg-accent/50"
                  )}
                >
                  {selected ? (
                    <FaCheck className="size-3.5 text-sidebar-foreground/80" />
                  ) : (
                    item.icon
                  )}
                  <span>{item.label}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Model Selector Button */}
        <DropdownMenu open={isModelSelectorOpen} onOpenChange={(open) => {
          setIsModelSelectorOpen(open);
          if (!open) {
            focusComposerInput();
          }
        }}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-sidebar-accent hover:bg-accent transition-colors flex-shrink-0 text-xs font-normal text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <LuSparkle className="w-3.5 h-3.5" />
              <span>{selectedModel.name}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-48 max-h-80 overflow-y-auto" onCloseAutoFocus={(e) => e.preventDefault()}>
            {AI_MODELS.map((model) => {
              const isSelected = selectedModelId === model.id;
              return (
                <DropdownMenuItem
                  key={model.id}
                  onClick={() => {
                    setSelectedModelId(model.id);
                    setIsModelSelectorOpen(false);
                    focusComposerInput();
                  }}
                  title={model.description}
                  aria-label={model.description ?? model.name}
                  className={cn(
                    "cursor-pointer",
                    isSelected && "bg-accent/50"
                  )}
                >
                  {isSelected ? (
                    <FaCheck className="size-3.5 text-sidebar-foreground/80" />
                  ) : (
                    <LuSparkle className="size-3.5" />
                  )}
                  <span>{model.name}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* AI Debug Button - only in development */}
        {process.env.NODE_ENV === "development" && (
          <button
            type="button"
            className="flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 transition-colors flex-shrink-0 text-xs font-normal text-red-500 hover:text-red-400 cursor-pointer border border-red-500/20"
            onClick={() => {
              window.open("http://localhost:4983", "_blank");
            }}
          >
            <Bug className="w-3.5 h-3.5" />
            <span>AI Debug</span>
          </button>
        )}
        {/* Warning icon for anonymous users */}
        {isAnonymous && (

          <Popover open={isWarningPopoverOpen} onOpenChange={(open) => {
            setIsWarningPopoverOpen(open);
            if (!open) {
              focusComposerInput();
            }
          }}>
            <PopoverTrigger asChild>
              <button
                type="button"
                onMouseEnter={() => {
                  if (hoverTimeoutRef.current) {
                    clearTimeout(hoverTimeoutRef.current);
                  }
                  setIsWarningPopoverOpen(true);
                }}
                onMouseLeave={() => {
                  hoverTimeoutRef.current = setTimeout(() => {
                    setIsWarningPopoverOpen(false);
                  }, 100);
                }}
                className="flex items-center justify-center w-5 h-5 rounded-md hover:bg-accent transition-colors flex-shrink-0 cursor-pointer"
                aria-label="Warning: AI chats won't save unless logged in"
              >
                <AlertTriangle className="w-4 h-4 text-yellow-500 animate-[pulse-scale_3.5s_ease-in-out_infinite]" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={8}
              onMouseEnter={() => {
                if (hoverTimeoutRef.current) {
                  clearTimeout(hoverTimeoutRef.current);
                }
                setIsWarningPopoverOpen(true);
              }}
              onMouseLeave={() => {
                hoverTimeoutRef.current = setTimeout(() => {
                  setIsWarningPopoverOpen(false);
                }, 100);
              }}
              className="w-64 p-3"
            >
              <div className="space-y-3">
                <p className="text-sm text-foreground">
                  Your AI chats won't save unless you are logged in.
                </p>
                <div className="flex items-center gap-2">
                  <Link href="/auth/sign-in" className="flex-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-7 text-xs"
                      onClick={() => setIsWarningPopoverOpen(false)}
                    >
                      Sign in
                    </Button>
                  </Link>
                  <Link href="/auth/sign-up" className="flex-1">
                    <Button
                      size="sm"
                      className="w-full h-7 text-xs"
                      onClick={() => setIsWarningPopoverOpen(false)}
                    >
                      Sign up
                    </Button>
                  </Link>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {/* Right side: speech/send/cancel button */}
      <div className="flex items-center gap-2">
        {!isAnonymous && <SpeechToTextButton />}
        <AuiIf condition={({ thread }) => !thread.isRunning}>
          <ComposerPrimitive.Send asChild>
            <TooltipIconButton
              tooltip="Send message"
              side="bottom"
              type="submit"
              variant="default"
              size="icon"
              className="aui-composer-send size-[34px] rounded-full p-1"
              aria-label="Send message"
            >
              <ArrowUpIcon className="aui-composer-send-icon size-4 text-gray-900 dark:text-gray-600" />
            </TooltipIconButton>
          </ComposerPrimitive.Send>
        </AuiIf>

        <AuiIf condition={({ thread }) => thread.isRunning}>
          <ComposerPrimitive.Cancel asChild>
            <Button
              type="button"
              variant="default"
              size="icon"
              className="aui-composer-cancel size-[34px] rounded-full border border-muted-foreground/60 hover:bg-primary/75 dark:border-muted-foreground/90"
              aria-label="Stop generating"
            >
              <Square className="aui-composer-cancel-icon size-3 text-gray-900 dark:text-gray-600 fill-current" />
            </Button>
          </ComposerPrimitive.Cancel>
        </AuiIf>
      </div>
    </div >
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root mt-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive dark:bg-destructive/5 dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root asChild>
      <div
        className="aui-assistant-message-root relative mx-auto w-full max-w-[var(--thread-max-width)] animate-in py-4 duration-150 ease-out fade-in slide-in-from-bottom-1 last:mb-24"
        data-role="assistant"
      >
        <div className="aui-assistant-message-content mx-2 leading-7 break-words text-foreground">
          <AssistantLoader />
          <MessagePrimitive.Parts
            components={{
              Text: MarkdownText,
              File: FileComponent,
              Source: Sources,
              Image,
              Reasoning: Reasoning,
              ReasoningGroup: ReasoningGroup,
              ToolGroup,
              tools: {
                Fallback: ToolFallback,
              },
            }}
          />
          <MessageError />
        </div>

        <div className="aui-assistant-message-footer mt-2 ml-2 flex">
          <BranchPicker />
          <AssistantActionBar />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  const { createCard, isCreating } = useCreateCardFromMessage({ debounceMs: 300 });

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="never"
      className="aui-assistant-action-bar-root col-start-3 row-start-2 -ml-1 flex gap-0.5 text-muted-foreground data-floating:absolute data-floating:rounded-md data-floating:border data-floating:bg-background data-floating:p-1 data-floating:shadow-sm"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy">
          <MessagePrimitive.If copied>
            <CheckIcon />
          </MessagePrimitive.If>
          <MessagePrimitive.If copied={false}>
            <CopyIcon />
          </MessagePrimitive.If>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="Refresh">
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
      <Button
        variant="ghost"
        size="sm"
        onClick={createCard}
        disabled={isCreating}
        className="!px-1 gap-1 h-6 text-xs font-medium hover:bg-sidebar-accent"
      >
        <FileText className={cn("h-3 w-3", isCreating && "animate-pulse")} />
        <span>Create Note</span>
      </Button>
    </ActionBarPrimitive.Root>
  );
};

// Custom Text component for UserMessage that handles special structure
const UserMessageText: FC = () => {
  const { text: rawText } = useMessagePartText();

  // Strip selected cards markers first (no UI representation)
  const text = parseSelectedCardsMarkers(rawText);

  // Process file markers: [FILE_URL:url|mediaType:type|filename:name] or [FILE_DATA:data|mediaType:type|filename:name]
  const fileUrlRegex = /\[FILE_URL:([^|]+)\|mediaType:([^|]*)\|filename:([^\]]*)\]/g;
  const fileDataRegex = /\[FILE_DATA:([^|]+)\|mediaType:([^|]*)\|filename:([^\]]*)\]/g;

  // Process URL markers: [URL_CONTEXT:url]
  const urlContextRegex = /\[URL_CONTEXT:([^\]]+)\]/g;

  // Find all file markers
  const fileMarkers: Array<{
    index: number;
    length: number;
    urlOrData: string;
    mediaType: string;
    filename: string;
  }> = [];

  // Find all URL markers
  const urlMarkers: Array<{
    index: number;
    length: number;
    url: string;
  }> = [];

  let match;
  while ((match = fileUrlRegex.exec(text)) !== null) {
    fileMarkers.push({
      index: match.index,
      length: match[0].length,
      urlOrData: match[1],
      mediaType: match[2],
      filename: match[3],
    });
  }

  while ((match = fileDataRegex.exec(text)) !== null) {
    fileMarkers.push({
      index: match.index,
      length: match[0].length,
      urlOrData: match[1],
      mediaType: match[2],
      filename: match[3],
    });
  }

  while ((match = urlContextRegex.exec(text)) !== null) {
    urlMarkers.push({
      index: match.index,
      length: match[0].length,
      url: match[1],
    });
  }

  // Combine and sort all markers by position
  const allMarkers = [
    ...fileMarkers.map(m => ({ ...m, type: 'file' as const })),
    ...urlMarkers.map(m => ({ ...m, type: 'url' as const })),
  ].sort((a, b) => a.index - b.index);

  // Build content parts (text segments, file chips, and URL chips)
  const contentParts: Array<{
    type: "text" | "file" | "url";
    content: string;
    fileInfo?: { urlOrData: string; mediaType: string; filename: string };
    urlInfo?: { url: string };
  }> = [];
  let lastIndex = 0;

  for (const marker of allMarkers) {
    // Add text before marker
    if (marker.index > lastIndex) {
      const textBefore = text.substring(lastIndex, marker.index);
      if (textBefore.trim()) {
        contentParts.push({ type: "text", content: textBefore });
      }
    }

    // Add file or URL chip
    if (marker.type === 'file') {
      contentParts.push({
        type: "file",
        content: "",
        fileInfo: {
          urlOrData: marker.urlOrData,
          mediaType: marker.mediaType,
          filename: marker.filename,
        },
      });
    } else if (marker.type === 'url') {
      contentParts.push({
        type: "url",
        content: "",
        urlInfo: {
          url: marker.url,
        },
      });
    }

    lastIndex = marker.index + marker.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const textAfter = text.substring(lastIndex);
    if (textAfter.trim()) {
      contentParts.push({ type: "text", content: textAfter });
    }
  }

  // If no markers found, use original text
  if (allMarkers.length === 0) {
    contentParts.push({ type: "text", content: text });
  }

  // Check if the message contains the reply marker
  const { cleanText: regularContent, replies: replyTexts } = parseReplyMarkers(text);

  if (replyTexts.length > 0) {
    // Find the marker index to filter file/URL markers
    const replyMarker = "[[REPLY_MARKER]]";
    const markerIndex = text.indexOf(replyMarker);

    // Process regular content for file and URL markers (only markers before reply marker)
    const regularFileMarkers = fileMarkers.filter(m => m.index < markerIndex);
    const regularUrlMarkers = urlMarkers.filter(m => m.index < markerIndex);
    const regularAllMarkers = [
      ...regularFileMarkers.map(m => ({ ...m, type: 'file' as const })),
      ...regularUrlMarkers.map(m => ({ ...m, type: 'url' as const })),
    ].sort((a, b) => a.index - b.index);

    const regularContentParts: Array<{
      type: "text" | "file" | "url";
      content: string;
      fileInfo?: { urlOrData: string; mediaType: string; filename: string };
      urlInfo?: { url: string };
    }> = [];

    if (regularAllMarkers.length > 0) {
      let regularLastIndex = 0;

      for (const marker of regularAllMarkers) {
        // Calculate relative position in regularContent
        const relativeIndex = marker.index;

        // Add text before marker
        if (relativeIndex > regularLastIndex) {
          const textBefore = regularContent.substring(regularLastIndex, relativeIndex);
          if (textBefore.trim()) {
            regularContentParts.push({ type: "text", content: textBefore });
          }
        }

        // Add file or URL chip
        if (marker.type === 'file') {
          regularContentParts.push({
            type: "file",
            content: "",
            fileInfo: {
              urlOrData: marker.urlOrData,
              mediaType: marker.mediaType,
              filename: marker.filename,
            },
          });
        } else if (marker.type === 'url') {
          regularContentParts.push({
            type: "url",
            content: "",
            urlInfo: {
              url: marker.url,
            },
          });
        }

        regularLastIndex = relativeIndex + marker.length;
      }

      // Add remaining text after last marker
      if (regularLastIndex < regularContent.length) {
        const textAfter = regularContent.substring(regularLastIndex);
        if (textAfter.trim()) {
          regularContentParts.push({ type: "text", content: textAfter });
        }
      }
    } else if (regularContent) {
      // No markers, just use the regular content
      regularContentParts.push({ type: "text", content: regularContent });
    }

    return (
      <div className="space-y-2">
        {replyTexts.length > 0 && (
          <div className="mb-2 pb-2 border-b border-sidebar-border/30">
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 space-y-2">
              <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
                Replying to:
              </div>
              <div className="space-y-1.5">
                {replyTexts.map((replyText, index) => (
                  <div
                    key={index}
                    className="text-sm text-blue-700 dark:text-blue-300 pl-2 border-l-2 border-blue-500/30"
                  >
                    {replyText.trim()}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {regularContentParts.length > 0 && (
          <div className="inline-flex flex-wrap items-center gap-2">
            {regularContentParts.map((part, index) => {
              if (part.type === "file" && part.fileInfo) {
                const isImage = part.fileInfo.mediaType.startsWith("image/");
                const isPdf = part.fileInfo.mediaType === "application/pdf";
                const fileIcon = isImage ? "🖼️" : isPdf ? "📄" : "📎";

                return (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-border/50 text-xs text-muted-foreground"
                  >
                    {fileIcon} {part.fileInfo.filename}
                  </span>
                );
              }
              if (part.type === "url" && part.urlInfo) {
                // Extract domain from URL for display
                let displayUrl = part.urlInfo.url;
                try {
                  const urlObj = new URL(part.urlInfo.url);
                  displayUrl = urlObj.hostname.replace('www.', '');
                } catch {
                  // Keep original URL if parsing fails
                }

                return (
                  <a
                    key={index}
                    href={part.urlInfo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-border/50 text-xs text-muted-foreground hover:bg-muted transition-colors"
                  >
                    🔗 {displayUrl}
                  </a>
                );
              }
              return <span key={index}>{part.content}</span>;
            })}
          </div>
        )}
      </div>
    );
  }

  // No reply marker, but may have file or URL markers
  if (allMarkers.length > 0) {
    return (
      <div className="inline-flex flex-wrap items-center gap-2">
        {contentParts.map((part, index) => {
          if (part.type === "file" && part.fileInfo) {
            const isImage = part.fileInfo.mediaType.startsWith("image/");
            const isPdf = part.fileInfo.mediaType === "application/pdf";
            const fileIcon = isImage ? "🖼️" : isPdf ? "📄" : "📎";

            return (
              <span
                key={index}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-border/50 text-xs text-muted-foreground"
              >
                {fileIcon} {part.fileInfo.filename}
              </span>
            );
          }
          if (part.type === "url" && part.urlInfo) {
            // Extract domain from URL for display
            let displayUrl = part.urlInfo.url;
            try {
              const urlObj = new URL(part.urlInfo.url);
              displayUrl = urlObj.hostname.replace('www.', '');
            } catch {
              // Keep original URL if parsing fails
            }

            return (
              <a
                key={index}
                href={part.urlInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-border/50 text-xs text-muted-foreground hover:bg-muted transition-colors"
              >
                🔗 {displayUrl}
              </a>
            );
          }
          return <span key={index}>{part.content}</span>;
        })}
      </div>
    );
  }

  // No special structure, render normally
  return <div>{text}</div>;
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root asChild>
      <div
        className="aui-user-message-root mx-auto grid w-full max-w-[var(--thread-max-width)] animate-in auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] gap-y-2 px-2 pt-4 pb-1 duration-150 ease-out fade-in slide-in-from-bottom-1 last:mb-5 [&:where(>*)]:col-start-2"
        data-role="user"
      >
        {/* Attachments display */}
        <UserMessageAttachments />

        <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
          <div className="aui-user-message-content rounded-lg bg-muted px-3 py-2 break-words text-foreground text-sm">
            <MessagePrimitive.Parts
              components={{
                Text: UserMessageText,
                File: FileComponent,
              }}
            />
          </div>
        </div>

        <div className="aui-user-message-footer ml-2 flex justify-end col-start-2 relative min-h-[20px]">
          <div className="absolute right-0">
            <UserActionBar />
          </div>
        </div>

        <BranchPicker className="aui-user-branch-picker col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
      </div>
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex gap-1 text-muted-foreground data-floating:absolute data-floating:rounded-md data-floating:border data-floating:bg-background data-floating:p-1 data-floating:shadow-sm"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy">
          <MessagePrimitive.If copied>
            <CheckIcon />
          </MessagePrimitive.If>
          <MessagePrimitive.If copied={false}>
            <CopyIcon />
          </MessagePrimitive.If>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

// Shared utility function for parsing reply markers from text
const parseReplyMarkers = (text: string): { cleanText: string; replies: string[] } => {
  const replyMarker = "[[REPLY_MARKER]]";
  const markerIndex = text.indexOf(replyMarker);

  if (markerIndex !== -1) {
    // Split the message into regular content and reply content
    const cleanText = text.substring(0, markerIndex).trim();
    const replyContent = text.substring(markerIndex + replyMarker.length);
    const endMarkerIndex = replyContent.indexOf(replyMarker);
    const extractedReplies = endMarkerIndex !== -1
      ? replyContent.substring(0, endMarkerIndex)
      : replyContent;

    // Split replies by pipe separator
    const replyTexts = extractedReplies.split('|').filter(r => r.trim().length > 0);

    return { cleanText, replies: replyTexts };
  }

  return { cleanText: text, replies: [] };
};

// Shared utility function for parsing selected cards markers from text (strips them from UI)
const parseSelectedCardsMarkers = (text: string): string => {
  const cardsMarker = "[[SELECTED_CARDS_MARKER]]";
  const markerIndex = text.indexOf(cardsMarker);

  if (markerIndex !== -1) {
    // Find the end marker and remove everything between (inclusive)
    const afterFirstMarker = text.substring(markerIndex + cardsMarker.length);
    const endMarkerIndex = afterFirstMarker.indexOf(cardsMarker);

    if (endMarkerIndex !== -1) {
      // Remove the entire block including markers
      const beforeMarker = text.substring(0, markerIndex).trim();
      const afterBlock = afterFirstMarker.substring(endMarkerIndex + cardsMarker.length).trim();
      return (beforeMarker + ' ' + afterBlock).trim();
    } else {
      // No end marker found, remove from first marker onwards
      return text.substring(0, markerIndex).trim();
    }
  }

  return text;
};

// Shared utility function for parsing selected cards markers from text and extracting the content
const parseSelectedCardsMarkersWithExtraction = (text: string): { cleanText: string; cardsContext: string } => {
  const cardsMarker = "[[SELECTED_CARDS_MARKER]]";
  const markerIndex = text.indexOf(cardsMarker);

  if (markerIndex !== -1) {
    // Split the message into regular content and cards content
    const cleanText = text.substring(0, markerIndex).trim();
    const cardsContent = text.substring(markerIndex + cardsMarker.length);
    const endMarkerIndex = cardsContent.indexOf(cardsMarker);
    const extractedCardsContext = endMarkerIndex !== -1
      ? cardsContent.substring(0, endMarkerIndex)
      : cardsContent;

    // Clean up the remaining text after the end marker
    const afterBlock = endMarkerIndex !== -1
      ? cardsContent.substring(endMarkerIndex + cardsMarker.length).trim()
      : "";

    const finalCleanText = afterBlock
      ? (cleanText + ' ' + afterBlock).trim()
      : cleanText;

    return { cleanText: finalCleanText, cardsContext: extractedCardsContext.trim() };
  }

  return { cleanText: text, cardsContext: "" };
};

// Parse URL context markers from text and extract URL information
const parseUrlMarkers = (text: string): {
  cleanText: string;
  urls: string[]
} => {
  const urlRegex = /\[URL_CONTEXT:(.+?)\]/g;
  const urls: string[] = [];
  let cleanText = text;

  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    urls.push(match[1]);
    // Remove the marker from clean text
    cleanText = cleanText.replace(match[0], '');
  }

  // Clean up any extra whitespace
  cleanText = cleanText.replace(/\s+/g, ' ').trim();

  return { cleanText, urls };
};

// Parse file markers from text and extract file information
const parseFileMarkers = (text: string): {
  cleanText: string;
  files: Array<{ urlOrData: string; mediaType: string; filename: string; isData: boolean }>
} => {
  const fileUrlRegex = /\[FILE_URL:([^|]+)\|mediaType:([^|]*)\|filename:([^\]]*)\]/g;
  const fileDataRegex = /\[FILE_DATA:([^|]+)\|mediaType:([^|]*)\|filename:([^\]]*)\]/g;

  const files: Array<{ urlOrData: string; mediaType: string; filename: string; isData: boolean }> = [];
  let cleanText = text;

  // Find and extract FILE_URL markers
  let match;
  const urlMatches: Array<{ match: string; url: string; mediaType: string; filename: string }> = [];
  while ((match = fileUrlRegex.exec(text)) !== null) {
    urlMatches.push({
      match: match[0],
      url: match[1],
      mediaType: match[2],
      filename: match[3],
    });
  }

  // Find and extract FILE_DATA markers
  const dataMatches: Array<{ match: string; data: string; mediaType: string; filename: string }> = [];
  while ((match = fileDataRegex.exec(text)) !== null) {
    dataMatches.push({
      match: match[0],
      data: match[1],
      mediaType: match[2],
      filename: match[3],
    });
  }

  // Combine and sort by position in text
  const allMatches = [
    ...urlMatches.map(m => ({ ...m, index: text.indexOf(m.match), isData: false })),
    ...dataMatches.map(m => ({ ...m, index: text.indexOf(m.match), isData: true })),
  ].sort((a, b) => b.index - a.index); // Sort in reverse to remove from end to start

  // Remove markers from text (in reverse order to maintain indices)
  for (const fileMatch of allMatches) {
    cleanText = cleanText.substring(0, fileMatch.index) + cleanText.substring(fileMatch.index + fileMatch.match.length);
    files.push({
      urlOrData: fileMatch.isData ? (fileMatch as typeof dataMatches[0]).data : (fileMatch as typeof urlMatches[0]).url,
      mediaType: fileMatch.mediaType,
      filename: fileMatch.filename,
      isData: fileMatch.isData,
    });
  }

  // Reverse files array to maintain original order
  files.reverse();

  return { cleanText: cleanText.trim(), files };
};

// Convert base64 data URL to File object
const dataUrlToFile = async (dataUrl: string, filename: string, mediaType: string): Promise<File> => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: mediaType });
};

// Convert URL to File object
const urlToFile = async (url: string, filename: string, mediaType: string): Promise<File> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new File([blob], filename, { type: mediaType });
};

// Helper to truncate text for display
const truncateText = (text: string, maxLength: number = 30) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + "...";
};

const EditComposer: FC = () => {
  const aui = useAui();
  const messageAttachments = useAuiState(
    useShallow(({ message }) => (message as { attachments?: unknown[] })?.attachments || [])
  );
  const hasParsedRef = useRef(false);
  const hasAttachmentsRestoredRef = useRef(false);
  const [parsedReplies, setParsedReplies] = useState<string[]>([]);
  const [parsedUrls, setParsedUrls] = useState<string[]>([]);
  const [parsedCardsContext, setParsedCardsContext] = useState<string>("");
  const [originalText, setOriginalText] = useState<string>("");
  const [currentText, setCurrentText] = useState<string>("");

  // Parse reply markers and restore attachments when edit mode is activated
  useEffect(() => {
    // Reset flags when component mounts (edit mode activated)
    hasParsedRef.current = false;
    hasAttachmentsRestoredRef.current = false;

    const composerState = aui?.composer()?.getState();

    if (!composerState || !composerState.text) return;

    // Parse file markers first (they're in the text)
    const { cleanText: textWithoutFiles, files } = parseFileMarkers(composerState.text);

    // Parse URL markers from the cleaned text
    const { cleanText: textWithoutUrls, urls } = parseUrlMarkers(textWithoutFiles);

    // Parse selected cards markers and extract the context content
    const { cleanText: textWithoutCards, cardsContext } = parseSelectedCardsMarkersWithExtraction(textWithoutUrls);

    // Then parse reply markers from the cleaned text
    const { cleanText, replies } = parseReplyMarkers(textWithoutCards);

    // Store parsed replies, URLs, and selected cards context in state (not in store) for display
    setParsedReplies(replies);
    setParsedUrls(urls);
    setParsedCardsContext(cardsContext);

    // Store original text for comparison (to disable Update button if unchanged)
    setOriginalText(cleanText);
    setCurrentText(cleanText);

    // Update input text to show only clean text (without markers)
    if (cleanText !== composerState.text) {
      aui?.composer()?.setText(cleanText);
    }

    hasParsedRef.current = true;

    // Restore file attachments from markers
    if (files.length > 0 && !hasAttachmentsRestoredRef.current) {
      const composerAttachments = composerState.attachments || [];

      // Only restore if attachments aren't already in composer
      if (composerAttachments.length === 0) {
        hasAttachmentsRestoredRef.current = true; // Set flag early to prevent duplicate restorations

        // Restore each file attachment
        (async () => {
          for (const fileInfo of files) {
            try {
              let file: File;

              if (fileInfo.isData) {
                // Handle base64 data URL
                const dataUrl = fileInfo.urlOrData.startsWith('data:')
                  ? fileInfo.urlOrData
                  : `data:${fileInfo.mediaType};base64,${fileInfo.urlOrData}`;
                file = await dataUrlToFile(dataUrl, fileInfo.filename, fileInfo.mediaType);
              } else {
                // Handle URL - check if it's a URL_CONTEXT or regular URL
                if (fileInfo.urlOrData.startsWith('http://') || fileInfo.urlOrData.startsWith('https://')) {
                  file = await urlToFile(fileInfo.urlOrData, fileInfo.filename, fileInfo.mediaType);
                } else {
                  // Might be a URL_CONTEXT marker, try creating URL file
                  try {
                    file = createUrlFile(fileInfo.urlOrData);
                  } catch {
                    // If that fails, try as regular URL
                    file = await urlToFile(fileInfo.urlOrData, fileInfo.filename, fileInfo.mediaType);
                  }
                }
              }

              aui?.composer()?.addAttachment(file);
            } catch (error) {
              console.error("Failed to restore file attachment:", error);
            }
          }
        })();
      }
    }

    // Also restore URL attachments from message attachments (for URL_CONTEXT markers)
    // These are separate from file markers in text, so check independently
    if (messageAttachments.length > 0) {
      const composerAttachments = composerState.attachments || [];

      // Only restore if we haven't already restored files from markers
      // or if there are no file markers but there are message attachments
      if (composerAttachments.length === 0 || files.length === 0) {
        (messageAttachments as Array<{ content?: Array<{ type: string;[key: string]: unknown }> }>).forEach((attachment) => {
          if (attachment.content) {
            // Check if it's a URL attachment
            const urlContent = attachment.content.find((c: { type: string;[key: string]: unknown }) =>
              c.type === "text" &&
              typeof (c as { type: "text"; text: string }).text === "string" &&
              (c as { type: "text"; text: string }).text.startsWith("[URL_CONTEXT:")
            );
            if (urlContent && urlContent.type === "text") {
              const textContent = urlContent as { type: "text"; text: string };
              const urlMatch = textContent.text.match(/\[URL_CONTEXT:(.+?)\]/);
              if (urlMatch && urlMatch[1]) {
                try {
                  const urlFile = createUrlFile(urlMatch[1]);
                  aui?.composer()?.addAttachment(urlFile);
                } catch (error) {
                  console.error("Failed to restore URL attachment:", error);
                }
              }
            }
          }
        });
      }
    }
  }, [aui, messageAttachments]);

  return (
    <div className="aui-edit-composer-wrapper mx-auto flex w-full max-w-[var(--thread-max-width)] flex-col gap-4 px-2 first:mt-4 mb-4">
      <ComposerPrimitive.Root
        className="aui-edit-composer-root ml-auto flex w-full max-w-7/8 flex-col rounded-xl bg-sidebar-accent border border-sidebar-border"
        onSubmit={(e) => {
          e.preventDefault();

          // Get the current composer state
          const composerState = aui?.composer()?.getState();
          if (!composerState) return;

          const currentText = composerState.text;

          // Re-add URL markers from parsed URLs (stored in state)
          let modifiedText = currentText;
          if (parsedUrls.length > 0) {
            // Add URL markers to the text
            const urlMarkers = parsedUrls.map(url => `[URL_CONTEXT:${url}]`).join(' ');
            modifiedText = `${urlMarkers} ${currentText}`.trim();
          }

          // Re-add selected cards markers from parsed cards context (stored in state)
          if (parsedCardsContext) {
            const cardsMarker = "[[SELECTED_CARDS_MARKER]]";
            modifiedText = modifiedText + `\n\n${cardsMarker}${parsedCardsContext}${cardsMarker}`;
          }

          // Re-add reply markers from parsed replies (stored in state)
          if (parsedReplies.length > 0) {
            const replyTexts = parsedReplies.join('|');
            const specialMarker = "[[REPLY_MARKER]]";
            modifiedText = modifiedText + `\n\n${specialMarker}${replyTexts}${specialMarker}`;
          }

          // Set the modified text and send
          aui?.composer()?.setText(modifiedText);
          aui?.composer()?.send();
        }}
      >
        {/* Attachment Display - shows restored and new attachments */}
        <ComposerAttachments />

        {/* Show parsed replies if any (read-only display, not in store) */}
        {parsedReplies.length > 0 && (
          <div className="px-4 pt-3 pb-2">
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 space-y-2">
              <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
                Replying to:
              </div>
              <div className="space-y-1.5">
                {parsedReplies.map((replyText: string, index: number) => (
                  <div
                    key={index}
                    className="text-sm text-blue-700 dark:text-blue-300 pl-2 border-l-2 border-blue-500/30"
                  >
                    {truncateText(replyText.trim())}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <ComposerPrimitive.Input
          className="aui-edit-composer-input flex min-h-[60px] w-full resize-none bg-transparent p-4 text-sidebar-foreground outline-none"
          autoFocus
          maxLength={10000}
          onChange={(e) => setCurrentText(e.target.value)}
        />

        {/* Show parsed URLs if any (using same UI as normal messages) */}
        {parsedUrls.length > 0 && (
          <div className="px-4 pt-2 pb-2">
            <div className="inline-flex flex-wrap items-center gap-2">
              {parsedUrls.map((url: string, index: number) => {
                // Extract domain from URL for display (same logic as normal messages)
                let displayUrl = url;
                try {
                  const urlObj = new URL(url);
                  displayUrl = urlObj.hostname.replace('www.', '');
                } catch {
                  // Keep original URL if parsing fails
                }

                return (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-border/50 text-xs text-muted-foreground hover:bg-muted transition-colors"
                  >
                    🔗 {displayUrl}
                  </a>
                );
              })}
            </div>
          </div>
        )}

        <div className="aui-edit-composer-footer mx-3 mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ComposerAddAttachment />
          </div>
          <div className="flex items-center gap-2">
            <ComposerPrimitive.Cancel asChild>
              <Button variant="ghost" size="sm" aria-label="Cancel edit">
                Cancel
              </Button>
            </ComposerPrimitive.Cancel>
            <ComposerPrimitive.Send asChild disabled={currentText === originalText}>
              <Button
                size="sm"
                aria-label="Update message"
                disabled={currentText === originalText}
                className={currentText === originalText ? "opacity-50 cursor-not-allowed" : ""}
              >
                Update
              </Button>
            </ComposerPrimitive.Send>
          </div>
        </div>
      </ComposerPrimitive.Root>
    </div>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root mr-2 -ml-2 inline-flex items-center text-xs text-muted-foreground",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
