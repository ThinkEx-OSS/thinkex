"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCreateWorkspaceFromPrompt } from "@/hooks/workspace/use-create-workspace";
import { ArrowUp, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import TypingText from "@/components/ui/typing-text";

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

const baseText = "Create a workspace on ";

interface HomePromptInputProps {
  shouldFocus?: boolean;
}

export function HomePromptInput({ shouldFocus }: HomePromptInputProps) {
  const router = useRouter();

  const { resolvedTheme } = useTheme();
  const [value, setValue] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [prefixTyped, setPrefixTyped] = useState(false);
  const [typedPrefix, setTypedPrefix] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingKeyRef = useRef(0);

  const createFromPrompt = useCreateWorkspaceFromPrompt();
  // const {
  //   uploadFiles: uploadImages,
  //   uploadedFiles: uploadedImages,
  //   isUploading: isUploadingImages,
  //   removeFile: removeImage,
  //   clearFiles: clearImages,
  // } = useImageUpload();

  // // Setup file picker for images (button-click only, no drag)
  // const { open: openImagePicker, getInputProps: getImageInputProps } = useDropzone({
  //   accept: {
  //     'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
  //   },
  //   multiple: true,
  //   noClick: true,
  //   noDrag: true,
  //   onDrop: async (acceptedFiles) => {
  //     if (acceptedFiles.length > 0) {
  //       // Auto-populate input based on total uploads
  //       const totalImages = uploadedImages.length + acceptedFiles.length;
  //       const totalPdfs = uploadedFiles.length;
  //       if (totalPdfs > 0) {
  //         const parts = [];
  //         parts.push(totalPdfs === 1 ? 'this pdf' : 'these pdfs');
  //         parts.push(totalImages === 1 ? 'this image' : 'these images');
  //         setValue(parts.join(' and '));
  //       } else if (totalImages === 1) {
  //         setValue("this image");
  //       } else {
  //         setValue("these images");
  //       }

  //       try {
  //         await uploadImages(acceptedFiles);
  //         toast.success(`Uploaded ${acceptedFiles.length} image${acceptedFiles.length > 1 ? 's' : ''}`);
  //       } catch (error) {
  //         toast.error("Failed to upload images");
  //       }
  //     }
  //   },
  // });

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

  // Handle user typing
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
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
    toast("Autogen coming soon");
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
                  maxHeight: '50vh',
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
            className="size-[34px] rounded-full p-1 absolute right-3 md:right-4 top-1/2 -translate-y-1/2"
            disabled={!value.trim()}
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
