"use client";

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TypingText from "@/components/ui/typing-text";

const PLACEHOLDER_OPTIONS = [
  "studying for my calculus exam",
  "research paper on machine learning",
  "startup pitch for business class",
  "analyzing psychology survey data",
  "writing my history essay",
  "comparing marketing case studies",
  "organizing my capstone project",
  "preparing my climate change presentation",
  "research on social media behavior",
  "analyzing financial data",
  "writing my CS project docs",
  "comparing literature sources",
  "organizing my internship notes",
  "studying for my organic chemistry final",
  "research on renewable energy",
  "drafting my grant proposal",
  "preparing for my biology midterm",
  "organizing my study abroad research",
  "comparing historical documents",
  "writing my Nike case study",
];

const baseText = "Create a workspace for ";

export function HomePromptInput() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingKeyRef = useRef(0);

  // Shuffle options with random start for variety
  const shuffledOptions = useMemo(() => {
    const start = Math.floor(Math.random() * PLACEHOLDER_OPTIONS.length);
    return [
      ...PLACEHOLDER_OPTIONS.slice(start),
      ...PLACEHOLDER_OPTIONS.slice(0, start),
    ];
  }, []);

  // Handle user typing - stop animation
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = value.trim();
    if (!prompt || isLoading) return;

    setIsLoading(true);
    try {
      const titleRes = await fetch("/api/workspaces/generate-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!titleRes.ok) {
        const err = await titleRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate title");
      }
      const { title, icon, color } = (await titleRes.json()) as { title: string; icon?: string; color?: string };

      const createRes = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: title,
          icon: icon || null,
          color: color || null,
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create workspace");
      }
      const { workspace } = (await createRes.json()) as { workspace: { slug: string } };

      setValue("");
      // Reset typing animation by changing key
      typingKeyRef.current += 1;
      router.push(
        `/workspace/${workspace.slug}?createFrom=${encodeURIComponent(prompt)}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error("Could not create workspace", { description: msg });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl">
      <div className="relative">
        {/* Input container styled to look like one input */}
        <div
          onClick={() => inputRef.current?.focus()}
          className={cn(
            "relative flex items-center gap-0 min-h-[60px] w-full",
            "bg-sidebar border border-sidebar-border/50 rounded-md",
            "focus-within:border-sidebar-foreground/20 focus-within:bg-sidebar",
            "transition-all duration-200",
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

            {/* Typing placeholder - only shows option text */}
            {!value && (
              <div
                className={cn(
                  "absolute inset-0 flex items-center pointer-events-none",
                  "pl-2 pr-14",
                  "text-lg text-muted-foreground"
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
                  typingSpeed={30}
                  deletingSpeed={30}
                  pauseDuration={2000}
                  loop={true}
                  showCursor={false}
                  className=""
                />
              </div>
            )}

            {/* Submit button - inside on the right */}
            <Button
              type="submit"
              size="icon"
              disabled={!value.trim() || isLoading}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2 z-20",
                "h-9 w-9 rounded-full",
                "bg-primary hover:bg-primary/90",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 text-gray-900 dark:text-gray-600 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4 text-gray-900 dark:text-gray-600" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
