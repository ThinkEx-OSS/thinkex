"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import TypingText from "@/components/ui/typing-text";
import {
  useHomeAttachments,
  ATTACHMENTS_SESSION_KEY,
  MAX_TOTAL_FILE_BYTES,
} from "@/contexts/HomeAttachmentsContext";
import { HomeAttachmentCards } from "./HomeAttachmentCards";

const URL_REGEX = /https?:\/\/[^\s]+/g;

function trimTrailingPunctuation(url: string): string {
  return url.replace(/[)\]\.,;:!?]+$/, "");
}
import { toast } from "sonner";

const PLACEHOLDER_OPTIONS = [
  "help me study organic chemistry",
  "make a study guide for AP Biology",
  "break down calc 3 double integrals",
  "quiz me on the French Revolution",
  "create flashcards for anatomy terms",
  "help me prep for my physics exam",
  "summarize my lecture on cellular respiration",
  "research the causes of World War II",
  "compare Monet and Van Gogh's techniques",
  "organize my sources on climate change",
  "help me outline my thesis on AI ethics",
  "brainstorm ideas for my essay",
  "help me learn React hooks",
  "plan a 2-week trip to Japan",
  "help me build a workout routine",
  "break down how React hooks work",
  "plan my monthly budget",
  "help me learn Spanish conjugations",
  "draft a project proposal for my team",
  "help me prep for my presentation",
];

interface HomePromptInputProps {
  shouldFocus?: boolean;
  /** Pre-fill the input with this text (e.g. from clipboard paste) */
  initialValue?: string;
  /** Called after initial value is applied (so parent can clear it) */
  onInitialValueApplied?: () => void;
}

export function HomePromptInput({ shouldFocus, initialValue, onInitialValueApplied }: HomePromptInputProps) {
  const router = useRouter();
  const {
    fileItems,
    links,
    addLink,
    removeFile,
    removeLink,
    totalFileSize,
    hasUploading,
    awaitAllUploads,
    getFileItems,
  } = useHomeAttachments();

  const [value, setValue] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [prefixTyped, setPrefixTyped] = useState(false);
  const [typedPrefix, setTypedPrefix] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingKeyRef = useRef(0);

  // Shuffle options with random start for variety
  const shuffledOptions = useMemo(() => {
    const start = Math.floor(Math.random() * PLACEHOLDER_OPTIONS.length);
    return [
      ...PLACEHOLDER_OPTIONS.slice(start),
      ...PLACEHOLDER_OPTIONS.slice(0, start),
    ];
  }, []);

  // Type "Ask ThinkEx to " character-by-character after intro completes
  useEffect(() => {
    if (!introComplete || prefixTyped) return;

    const prefix = "Ask ThinkEx to\u00a0";
    let index = 0;
    const intervalId = setInterval(() => {
      index++;
      if (index <= prefix.length) {
        setTypedPrefix(prefix.slice(0, index));
      } else {
        clearInterval(intervalId);
        setPrefixTyped(true);
      }
    }, 35);

    return () => clearInterval(intervalId);
  }, [introComplete, prefixTyped]);

  // Focus input when hero section becomes visible
  useEffect(() => {
    if (shouldFocus && inputRef.current) {
      const timer = setTimeout(() => {
        inputRef.current?.focus({ preventScroll: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [shouldFocus]);

  // Extract URLs from text and add as link attachments; return cleaned text
  const processTextForLinks = (raw: string): string => {
    const matches = raw.match(URL_REGEX) ?? [];
    const urls = [...new Set(matches.map((u) => trimTrailingPunctuation(u)))];
    if (urls.length === 0) return raw;
    let cleaned = raw;
    for (const url of urls) {
      if (!links.includes(url)) addLink(url);
      cleaned = cleaned.split(url).join(" ");
    }
    return cleaned.replace(/\s+/g, " ").trim();
  };

  // Apply initial value (e.g. from clipboard paste) — run link detection too
  useEffect(() => {
    if (initialValue !== undefined && initialValue !== "") {
      setValue(processTextForLinks(initialValue));
      onInitialValueApplied?.();
    }
  }, [initialValue, onInitialValueApplied]);

  // Handle user typing — extract pasted/typed URLs into link attachments
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(processTextForLinks(e.target.value));
  };

  // Auto-resize effect
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
      setIsExpanded(textarea.scrollHeight > 80);
    }
  }, [value]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    if (totalFileSize > MAX_TOTAL_FILE_BYTES) {
      toast.error(
        `Total file size exceeds ${MAX_TOTAL_FILE_BYTES / (1024 * 1024)}MB limit`
      );
      return;
    }

    if (fileItems.some((i) => i.status === "error")) {
      toast.error("Please remove failed uploads or try again");
      return;
    }

    setIsSubmitting(true);
    try {
      if (hasUploading) {
        await awaitAllUploads();
      }

      const latestFileItems = getFileItems();
      if (latestFileItems.some((i) => i.status === "error")) {
        toast.error("Please remove failed uploads or try again");
        setIsSubmitting(false);
        return;
      }

      const fileUrls = latestFileItems
        .filter((i) => i.status === "ready" && i.result)
        .map((i) => i.result!);

      sessionStorage.setItem(
        ATTACHMENTS_SESSION_KEY,
        JSON.stringify({ fileUrls, links })
      );
      router.push(`/generate?prompt=${encodeURIComponent(trimmed)}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setIsSubmitting(false);
    }
  };



  return (
    <form onSubmit={handleSubmit} className="w-full max-w-[760px]">
      <div className="relative">
        {/* Input container styled to look like one input */}
        <div
          onClick={() => inputRef.current?.focus()}
          className={cn(
            "relative w-full",
            isExpanded ? "rounded-[24px]" : "rounded-[32px]",
            "border",
            "bg-sidebar backdrop-blur-xl",
            "px-4 py-1 md:px-6 md:py-2",
            "pr-14 md:pr-16",
            "shadow-[0_24px_90px_-40px_rgba(0,0,0,0.85)]",
            "transition-[border-radius,height] duration-300 ease-in-out",
            "cursor-text"
          )}
        >
          <div>
            <HomeAttachmentCards
              fileItems={fileItems}
              links={links}
              onRemoveFile={removeFile}
              onRemoveLink={removeLink}
            />
            <div className="relative min-w-0 overflow-hidden">
              <textarea
                ref={inputRef}
                value={value}
                onChange={handleInput}
                placeholder=""
                autoFocus
                aria-label="Workspace prompt"
                rows={1}
                style={{
                  height: 'auto',
                  minHeight: '2rem',
                  paddingTop: '0.5rem',
                  paddingBottom: '0.25rem',
                  paddingLeft: '0',
                  paddingRight: '0',
                  maxHeight: '28vh',
                  overflowY: 'auto',
                }}
                className={cn(
                  "w-full border-0 resize-none",
                  "focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 outline-none",
                  "!text-base !font-normal !tracking-normal",
                  "bg-transparent",
                  "text-foreground placeholder:text-transparent"
                )}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />

              {/* Prefix + typing placeholder — only visible when input is empty */}
              {!value && (
                <div
                  className={cn(
                    "absolute inset-0 flex items-start pt-[0.5rem] pointer-events-none",
                    "text-base tracking-normal"
                  )}
                  style={{ willChange: 'transform' }}
                >
                  {!introComplete ? (
                    <span className="text-muted-foreground">
                      <TypingText
                        key={`intro-${typingKeyRef.current}`}
                        text={["Describe what you're working on", ""]}
                        typingSpeed={35}
                        deletingSpeed={25}
                        pauseDuration={2500}
                        loop={false}
                        showCursor={false}
                        className="!leading-6"
                        onSentenceComplete={() => setIntroComplete(true)}
                      />
                    </span>
                  ) : !prefixTyped ? (
                    <span className="text-muted-foreground font-normal">{typedPrefix}</span>
                  ) : (
                    <>
                      <span className="text-muted-foreground font-normal shrink-0">Ask ThinkEx to&nbsp;</span>
                      <span className="text-muted-foreground">
                        <TypingText
                          key={typingKeyRef.current}
                          text={shuffledOptions}
                          typingSpeed={35}
                          deletingSpeed={25}
                          pauseDuration={2500}
                          loop={true}
                          showCursor={false}
                          className="!leading-6"
                        />
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>



          <TooltipIconButton
            tooltip="Create workspace"
            side="bottom"
            type="submit"
            variant="default"
            size="icon"
            className={cn(
              "size-[34px] rounded-full p-1 absolute right-3 md:right-4",
              isExpanded ? "bottom-3 md:bottom-4" : "top-1/2 -translate-y-1/2"
            )}
            disabled={!value.trim() || isSubmitting}
            onClick={(e) => e.stopPropagation()}
            aria-label="Create workspace"
          >
            <ArrowUp className="size-4 text-background" />
          </TooltipIconButton>
        </div>
      </div>

    </form>
  );
}
