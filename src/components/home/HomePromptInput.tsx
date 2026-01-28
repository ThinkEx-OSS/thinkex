"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Typewriter, { TypewriterClass } from "typewriter-effect";

const PLACEHOLDER_OPTIONS = [
  "learning Spanish",
  "meal planning",
  "productivity tips",
  "hiking trails nearby",
  "interior design ideas",
  "beginner guitar",
  "healthy breakfast recipes",
  "weekend trip ideas",
  "mindfulness and meditation",
  "budgeting and saving",
  "home workout routines",
  "book recommendations",
  "gardening basics",
  "morning routines",
  "travel photography",
  "cooking for beginners",
  "personal finance",
  "storytelling and writing",
  "coffee brewing at home",
  "day trips and getaways",
];

const baseText = "Create a workspace for ";

export function HomePromptInput() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const typewriterRef = useRef<TypewriterClass | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cleanup typewriter on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (typewriterRef.current) {
        typewriterRef.current.stop();
      }
    };
  }, []);

  // Handle user typing - stop animation
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
  };

  const handleFocus = () => {
    setIsFocused(true);
    if (typewriterRef.current) {
      typewriterRef.current.stop();
      typewriterRef.current.deleteAll(1);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (value.length === 0 && typewriterRef.current) {
      typewriterRef.current.start();
    }
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
      if (typewriterRef.current) {
        typewriterRef.current.start();
      }
      router.push(
        `/dashboard/${workspace.slug}?createFrom=${encodeURIComponent(prompt)}`
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
            "bg-muted/50 border-2 border-sidebar-border/50 rounded-md",
            "focus-within:border-primary/50 focus-within:bg-muted/80",
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
              onFocus={handleFocus}
              onBlur={handleBlur}
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

            {/* Typewriter placeholder - only shows option text */}
            {!value && !isFocused && (
              <div
                className={cn(
                  "absolute inset-0 flex items-center pointer-events-none",
                  "pl-2 pr-14",
                  "text-lg text-muted-foreground"
                )}
                style={{ willChange: 'transform', fontSize: '1.125rem', lineHeight: '1.75rem' }}
              >
                <Typewriter
                  onInit={(typewriter) => {
                    typewriterRef.current = typewriter;
                    
                    const cycleOptions = () => {
                      const start = Math.floor(Math.random() * PLACEHOLDER_OPTIONS.length);
                      const ordered = [
                        ...PLACEHOLDER_OPTIONS.slice(start),
                        ...PLACEHOLDER_OPTIONS.slice(0, start),
                      ];
                      ordered.forEach((option, index) => {
                        if (index === 0) {
                          typewriter.typeString(option);
                        } else {
                          const prevLen = ordered[index - 1].length;
                          typewriter
                            .pauseFor(2000)
                            .deleteChars(prevLen)
                            .typeString(option);
                        }
                      });
                      const lastLen = ordered[ordered.length - 1].length;
                      typewriter
                        .pauseFor(2000)
                        .deleteChars(lastLen)
                        .callFunction(() => {
                          cycleOptions();
                        });
                    };
                    
                    cycleOptions();
                    typewriter.start();
                  }}
                  options={{
                    delay: 20,
                    deleteSpeed: 8,
                    cursor: "|",
                    loop: false,
                  }}
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
