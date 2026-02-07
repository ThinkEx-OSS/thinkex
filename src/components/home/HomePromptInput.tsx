"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCreateWorkspaceFromPrompt } from "@/hooks/workspace/use-create-workspace";
import { usePdfUpload } from "@/hooks/workspace/use-pdf-upload";
import { ArrowUp, FileText, Loader2, Plus, Upload, X, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import TypingText from "@/components/ui/typing-text";
import { useDropzone } from "react-dropzone";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import type { PdfData } from "@/lib/workspace-state/types";

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

const baseText = "Create a workspace on ";

interface HomePromptInputProps {
  shouldFocus?: boolean;
}

export function HomePromptInput({ shouldFocus }: HomePromptInputProps) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [value, setValue] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUrlDialogOpen, setIsUrlDialogOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [textIndent, setTextIndent] = useState(180); // Default fallback
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prefixRef = useRef<HTMLSpanElement>(null);
  const typingKeyRef = useRef(0);

  const createFromPrompt = useCreateWorkspaceFromPrompt();
  const { uploadFiles, uploadedFiles, isUploading, removeFile, clearFiles } = usePdfUpload();

  // Setup drop zone for PDF files
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
    },
    multiple: true,
    noClick: true, // Don't open file dialog on click (only on drag)
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        // Auto-populate input immediately
        const totalFiles = uploadedFiles.length + acceptedFiles.length;
        if (totalFiles === 1) {
          setValue("this pdf");
        } else if (totalFiles > 1) {
          setValue("these pdfs");
        }

        try {
          await uploadFiles(acceptedFiles);
          toast.success(`Uploaded ${acceptedFiles.length} PDF${acceptedFiles.length > 1 ? 's' : ''}`);
        } catch (error) {
          toast.error("Failed to upload PDFs");
        }
      }
    },
  });

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

  // Dynamic width measurement for perfect alignment
  // using useLayoutEffect to prevent layout shift flash if possible, or useEffect
  useEffect(() => {
    if (prefixRef.current) {
      // Measure width of static text
      const width = prefixRef.current.offsetWidth;
      // Add roughly one space width (approx 4-5px for typical font, but let's say 6px to be safe)
      setTextIndent(width + 6);
    }
  }, []);

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

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (prefixRef.current) {
      prefixRef.current.style.transform = `translateY(-${e.currentTarget.scrollTop}px)`;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = value.trim();
    if (!prompt || createFromPrompt.isLoading || isUploading) return;

    // Construct initial state with PDF cards AND empty placeholder cards if files were uploaded
    let initialState = undefined;
    if (uploadedFiles.length > 0) {
      // Calculate total PDF height (each PDF takes 10 rows)
      const pdfHeight = 10;
      const totalPdfY = uploadedFiles.length * pdfHeight;

      // Create PDF card items from uploaded files (stacked vertically at top)
      const pdfItems = uploadedFiles.map((file, index) => ({
        id: crypto.randomUUID(),
        type: 'pdf' as const,
        name: file.name,
        subtitle: '',
        color: '#6366F1' as const, // Indigo for PDFs
        layout: { x: 0, y: index * pdfHeight, w: 4, h: pdfHeight },
        lastSource: 'user' as const,
        data: {
          fileUrl: file.fileUrl,
          filename: file.filename,
          fileSize: file.fileSize,
        } as PdfData,
      }));

      // Create empty placeholder cards with fixed layout and colors
      const noteId = crypto.randomUUID();
      const quizId = crypto.randomUUID();
      const flashcardId = crypto.randomUUID();

      const emptyNote = {
        id: noteId,
        type: 'note' as const,
        name: 'Update me',
        subtitle: '',
        color: '#10B981' as const, // Emerald for Note
        layout: { x: 0, y: totalPdfY, w: 4, h: 13 },
        lastSource: 'user' as const,
        data: {
          blockContent: [],
          field1: '',
        },
      };

      const emptyQuiz = {
        id: quizId,
        type: 'quiz' as const,
        name: 'Update me',
        subtitle: '',
        color: '#F59E0B' as const, // Amber for Quiz
        layout: { x: 0, y: totalPdfY + 13, w: 2, h: 13 },
        lastSource: 'user' as const,
        data: {
          questions: [],
        },
      };

      const emptyFlashcard = {
        id: flashcardId,
        type: 'flashcard' as const,
        name: 'Update me',
        subtitle: '',
        color: '#EC4899' as const, // Pink for Flashcards
        layout: { x: 2, y: totalPdfY + 13, w: 2, h: 8 },
        lastSource: 'user' as const,
        data: {
          cards: [],
        },
      };

      const allItems = [...pdfItems, emptyNote, emptyQuiz, emptyFlashcard];

      initialState = {
        workspaceId: '', // Will be set by backend
        globalTitle: '',
        globalDescription: '',
        items: allItems,
        itemsCreated: allItems.length,
      };
    }

    createFromPrompt.mutate(prompt, {
      template: uploadedFiles.length > 0 ? "blank" : "getting_started", // Use blank template if PDFs provided
      initialState,
      onSuccess: (workspace) => {
        // Reset typing animation by changing key
        typingKeyRef.current += 1;
        // Clear uploaded files
        clearFiles();
        const url = `/workspace/${workspace.slug}`;
        const params = new URLSearchParams();

        if (uploadedFiles.length > 0) {
          params.set('action', 'generate_study_materials');
        } else {
          params.set('createFrom', prompt);
        }

        router.push(`${url}?${params.toString()}`);
      },
      onError: (err) => {
        toast.error("Could not create workspace", { description: err.message });
      },
    });
  };

  const handleUrlSubmit = () => {
    if (!urlInput.trim()) return;

    // Append URL to current value, adding a space if needed
    const newValue = value + (value && !value.endsWith(' ') ? ' ' : '') + urlInput.trim() + ' ';
    setValue(newValue);
    setUrlInput("");
    setIsUrlDialogOpen(false);

    // Focus back on input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-[760px]">
      <div className="relative" {...getRootProps()}>
        <input {...getInputProps()} />

        {/* Drag overlay */}
        {isDragActive && (
          <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-foreground/40 bg-background/90 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-foreground">
              <Upload className="h-8 w-8" />
              <p className="text-sm font-medium">Drop PDFs here</p>
            </div>
          </div>
        )}

        {/* Uploaded files display */}
        {uploadedFiles.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {uploadedFiles.map((file) => (
              <div
                key={file.fileUrl}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-1.5",
                  "bg-muted border",
                  "text-sm"
                )}
              >
                <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate max-w-[200px]">{file.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(file.fileUrl);
                  }}
                  className="ml-1 hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input container styled to look like one input */}
        <div
          onClick={() => inputRef.current?.focus()}
          className={cn(
            "relative w-full min-h-[96px]",
            isExpanded ? "rounded-[24px]" : "rounded-[32px]",
            "border",
            "bg-sidebar backdrop-blur-xl",
            "px-4 py-2 md:px-6 md:py-3",
            "shadow-[0_24px_90px_-40px_rgba(0,0,0,0.85)]",
            "focus-within:border-foreground/40",
            "transition-[border-radius,height] duration-300 ease-in-out",
            "cursor-text"
          )}
        >
          <div className="relative flex-1 min-w-0 overflow-hidden">
            {/* Static Prefix - positioned absolutely but matched with text-indent */}
            {/* Static Prefix - positioned absolutely but matched with text-indent */}
            <span
              ref={prefixRef}
              className={cn(
                "absolute left-0 top-0 select-none",
                "!text-base !font-normal !tracking-normal text-foreground", // Match textarea exactly
                "pt-[0.5rem]" // Matches textarea padding-top
              )}
              style={{
                pointerEvents: 'none'
              }}
            >
              Create a workspace on
            </span>

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
                minHeight: '3rem',
                paddingTop: '0.5rem',
                paddingBottom: '0.5rem',
                paddingLeft: '0',
                paddingRight: '0',
                maxHeight: '50vh',
                overflowY: 'auto',
                textIndent: `${textIndent}px`
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
              onScroll={handleScroll}
            />

            {/* Typing placeholder - dimmer for contrast with white prefix */}
            {!value && (
              <div
                className={cn(
                  "absolute inset-0 flex items-start pt-[0.5rem] pointer-events-none",
                  "text-base text-muted-foreground tracking-normal"
                )}
                style={{
                  willChange: 'transform',
                  textIndent: `${textIndent}px`
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
                  className="!leading-6"
                />
              </div>
            )}
          </div>

          <div className="mt-0 flex items-center justify-between gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "h-8 w-8 md:h-9 md:w-9 rounded-full border",
                    "flex items-center justify-center",
                    "hover:bg-muted transition-colors"
                  )}
                  aria-label="Add attachment"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={10}>
                <DropdownMenuItem onClick={() => open()}>
                  <FileText className="mr-2 h-4 w-4" />
                  <span>Upload PDF</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsUrlDialogOpen(true)}>
                  <LinkIcon className="mr-2 h-4 w-4" />
                  <span>Add URL</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center gap-3 md:gap-4">




              <button
                type="submit"
                disabled={!value.trim() || createFromPrompt.isLoading || isUploading}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "h-8 w-8 md:h-9 md:w-9 rounded-full",
                  "flex items-center justify-center",
                  "bg-foreground text-background",
                  "transition-colors",
                  "hover:bg-foreground/90",
                  "disabled:opacity-40 disabled:cursor-not-allowed"
                )}
                aria-label="Submit prompt"
              >
                {createFromPrompt.isLoading || isUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ArrowUp className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isUrlDialogOpen} onOpenChange={setIsUrlDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Link</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Input
              placeholder="Paste URL here..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleUrlSubmit();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUrlDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUrlSubmit} disabled={!urlInput.trim()}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
