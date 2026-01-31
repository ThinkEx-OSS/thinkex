"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCreateWorkspaceFromPrompt } from "@/hooks/workspace/use-create-workspace";
import { ArrowUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import TypingText from "@/components/ui/typing-text";

const PLACEHOLDER_OPTIONS = [
  "Calc 3 double integrals",
  "planning a 2 week trip to Japan",
  "APUSH Native American history",
  "building a home workout routine",
  "research on Pablo Picasso's paintings",
  "starting a dropshipping business",
  "learning React hooks and state",
  "meal prepping for the week",
  "organic chemistry reaction mechanisms",
  "training for my first marathon",
  "To Kill a Mockingbird analysis",
  "planning my wedding budget",
  "basic algebra word problems",
  "redecorating my living room",
  "learning Spanish verb conjugations",
  "learning to invest in index funds",
  "World War II European theater",
  "planning a surprise birthday party",
  "intro to Python programming",
  "starting a YouTube channel",
  "AP Bio cellular respiration",
  "building my personal portfolio site",
  "high school geometry proofs",
  "tracking my monthly expenses",
  "solar system planets and moons",
  "planning a camping trip to Yosemite",
  "learning guitar chord progressions",
  "organizing my home office",
  "French Revolution causes and effects",
  "beginner photography composition",
  "statistics hypothesis testing",
  "comparing Monet and Van Gogh",
  "US Presidents and their policies",
  "physics kinematics problems",
];

const baseText = "Create a workspace for ";

interface HomePromptInputProps {
  shouldFocus?: boolean;
}

export function HomePromptInput({ shouldFocus }: HomePromptInputProps) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const typingKeyRef = useRef(0);
  
  const createFromPrompt = useCreateWorkspaceFromPrompt();

  // Shuffle options with random start for variety
  const shuffledOptions = useMemo(() => {
    const start = Math.floor(Math.random() * PLACEHOLDER_OPTIONS.length);
    return [
      ...PLACEHOLDER_OPTIONS.slice(start),
      ...PLACEHOLDER_OPTIONS.slice(0, start),
    ];
  }, []);

  // Focus input when hero section becomes visible
  useEffect(() => {
    if (shouldFocus && inputRef.current) {
      const timer = setTimeout(() => {
        inputRef.current?.focus({ preventScroll: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [shouldFocus]);

  // Handle user typing - stop animation
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = value.trim();
    if (!prompt || createFromPrompt.isLoading) return;

    createFromPrompt.mutate(prompt, {
      template: "getting_started", // Auto-include sample content (quiz/flashcards) for home prompt (magic feeling)
      onSuccess: (workspace) => {
        // Reset typing animation by changing key
        typingKeyRef.current += 1;
        router.push(
          `/workspace/${workspace.slug}?createFrom=${encodeURIComponent(prompt)}`
        );
      },
      onError: (err) => {
        toast.error("Could not create workspace", { description: err.message });
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl">
      <div className="relative">
        {/* Input container styled to look like one input */}
        <div
          onClick={() => inputRef.current?.focus()}
          className={cn(
            "relative flex items-center gap-0 min-h-[56px] w-full",
            "bg-background/80 backdrop-blur-xl",
            "border border-white/10 rounded-xl",
            "shadow-[0_0_60px_-15px_rgba(255,255,255,0.1)]",
            "focus-within:shadow-[0_0_80px_-10px_rgba(255,255,255,0.15)]",
            "focus-within:border-white/60",
            "transition-all duration-300",
            "cursor-text"
          )}
        >
          {/* Prefix label */}
          <span
            id="workspace-prompt-label"
            className={cn(
              "text-lg text-foreground whitespace-nowrap flex-shrink-0",
              "pl-4 pr-0"
            )}
            style={{ fontSize: '1.125rem', lineHeight: '1.75rem' }}
          >
            {baseText}
          </span>

          {/* Input field */}
          <div className="relative flex-1 min-w-0">
            <Input
              ref={inputRef}
              value={value}
              onChange={handleInput}
              placeholder=""
              maxLength={300}
              autoFocus
              aria-labelledby="workspace-prompt-label"
              style={{
                fontSize: '1.125rem',
                lineHeight: '1.75rem',
                height: 'auto',
                minHeight: '60px',
                paddingTop: '1rem',
                paddingBottom: '1rem',
                paddingLeft: '0.25rem',
                paddingRight: '3.5rem'
              }}
              className={cn(
                "w-full border-0",
                "focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0",
                "!text-lg md:!text-lg",
                "bg-transparent dark:bg-transparent",
                "h-auto"
              )}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />

            {/* Typing placeholder - dimmer for contrast with white prefix */}
            {!value && (
              <div
                className={cn(
                  "absolute inset-0 flex items-center pointer-events-none",
                  "pl-2 pr-14",
                  "text-lg text-muted-foreground/50"
                )}
                style={{
                  willChange: 'transform',
                  fontSize: '1.125rem',
                  lineHeight: '1.75rem',
                  transform: 'translateX(-4px)'
                }}
              >
                <TypingText
                  key={typingKeyRef.current}
                  text={shuffledOptions}
                  typingSpeed={35}
                  deletingSpeed={25}
                  pauseDuration={2500}
                  loop={true}
                  showCursor={false}
                  className=""
                />
              </div>
            )}

            {/* Submit arrow */}
            <button
              type="submit"
              disabled={!value.trim() || createFromPrompt.isLoading}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "absolute right-3 top-1/2 -translate-y-1/2 z-20",
                "p-1 transition-opacity duration-200",
                "disabled:opacity-30 disabled:cursor-not-allowed",
                "hover:opacity-80"
              )}
            >
              {createFromPrompt.isLoading ? (
                <Loader2 className="h-6 w-6 text-white animate-spin" />
              ) : (
                <ArrowUp className="h-6 w-6 text-white" />
              )}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
