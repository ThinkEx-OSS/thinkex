"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { ArrowUp, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Typewriter, { TypewriterClass } from "typewriter-effect";

const PLACEHOLDER_OPTIONS = [
  "climate change impacts",
  "quantum computing applications",
  "neural network architectures",
  "CRISPR gene editing",
  "renewable energy systems",
  "machine learning ethics",
  "space exploration missions",
  "biotechnology advances",
  "sustainable agriculture",
  "artificial intelligence safety",
  "blockchain technology",
  "cancer immunotherapy",
  "ocean acidification",
  "renewable energy storage",
  "autonomous vehicles",
  "precision medicine",
  "carbon capture technology",
  "synthetic biology",
  "quantum cryptography",
  "fusion energy research",
];

const baseText = "Create a workspace for ";

export function HomePromptInput() {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typewriterRef = useRef<TypewriterClass | null>(null);

  // Cleanup typewriter on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (typewriterRef.current) {
        typewriterRef.current.stop();
      }
    };
  }, []);

  // Handle user typing - stop animation
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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

  const handleFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    toast.info("Coming soon", {
      description: "File upload for workspace creation will be available soon!",
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;

    toast.info("Coming soon", {
      description: "Workspace creation from prompts will be available soon!",
    });

    setValue("");
    if (typewriterRef.current) {
      typewriterRef.current.start();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-3xl">
      <div className="relative">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Textarea */}
        <div className="relative flex-1">
          {/* File upload button - inside on the left */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleFileUpload}
            className={cn(
              "absolute left-2 top-1/2 -translate-y-1/2 z-10",
              "h-9 w-9",
              "hover:bg-sidebar-accent",
              "text-muted-foreground hover:text-foreground"
            )}
          >
            <Paperclip className="h-5 w-5" />
          </Button>

          <Textarea
            value={value}
            onChange={handleInput}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder=""
            style={{ fontSize: '1.125rem', lineHeight: '1.75rem', paddingTop: '1rem', paddingBottom: '1rem' }}
            className={cn(
              "min-h-[60px] w-full resize-none relative z-10",
              "!text-lg md:!text-lg",
              "bg-background/50",
              "border-2 border-sidebar-border/50",
              "focus:border-primary/50 focus:bg-background/80",
              "transition-all duration-200",
              "pl-12 pr-14"
            )}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />

          {/* Typewriter placeholder - positioned over textarea, hidden on focus */}
          {!value && !isFocused && (
            <div
              className={cn(
                "absolute inset-0 flex items-center pointer-events-none z-[5]",
                "pl-12 pr-14",
                "text-lg text-muted-foreground"
              )}
              style={{ willChange: 'transform' }}
            >
              <Typewriter
                onInit={(typewriter) => {
                  typewriterRef.current = typewriter;
                  
                  // Paste base text instantly (only once, outside the loop)
                  typewriter.pasteString(baseText, null);
                  
                  const cycleOptions = () => {
                    // Cycle through options with animation
                    PLACEHOLDER_OPTIONS.forEach((option, index) => {
                      if (index === 0) {
                        typewriter.typeString(option);
                      } else {
                        typewriter
                          .pauseFor(2000)
                          .deleteChars(PLACEHOLDER_OPTIONS[index - 1].length)
                          .typeString(option);
                      }
                    });
                    
                    // After last option, delete it and restart the cycle
                    typewriter
                      .pauseFor(2000)
                      .deleteChars(PLACEHOLDER_OPTIONS[PLACEHOLDER_OPTIONS.length - 1].length)
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
                  cursor: "",
                  loop: false,
                }}
              />
            </div>
          )}

          {/* Submit button - inside on the right */}
          <Button
            type="submit"
            size="icon"
            disabled={!value.trim()}
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2 z-20",
              "h-9 w-9 rounded-full",
              "bg-primary hover:bg-primary/90",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <ArrowUp className="h-4 w-4 text-gray-900 dark:text-gray-600" />
          </Button>
        </div>
      </div>
    </form>
  );
}
