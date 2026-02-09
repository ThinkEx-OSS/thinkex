"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCreateWorkspaceFromPrompt } from "@/hooks/workspace/use-create-workspace";
import type { UploadedPdfMetadata } from "@/hooks/workspace/use-pdf-upload";
// import { useImageUpload } from "@/hooks/workspace/use-image-upload";
import { ArrowUp, FileText, Loader2, X, Link as LinkIcon, SlidersHorizontal } from "lucide-react";
// import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import TypingText from "@/components/ui/typing-text";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { PdfData } from "@/lib/workspace-state/types";
import { defaultDataFor } from "@/lib/workspace-state/item-helpers";

// --- Generation Settings ---
type GenContentType = 'note' | 'quiz' | 'flashcard' | 'youtube';

interface GenerationSettings {
  auto: boolean;
  types: GenContentType[];
}

const DEFAULT_GEN_SETTINGS: GenerationSettings = {
  auto: true,
  types: ['note', 'quiz', 'flashcard', 'youtube'],
};

const ALL_CONTENT_TYPES: { key: GenContentType; label: string }[] = [
  { key: 'note', label: 'Notes' },
  { key: 'quiz', label: 'Quizzes' },
  { key: 'flashcard', label: 'Flashcards' },
  { key: 'youtube', label: 'YouTube Videos' },
];

/**
 * Build placeholder workspace items for selected content types.
 */
function buildPlaceholderItems(
  effectiveTypes: Set<GenContentType>,
  startY: number,
  heights: { note: number; flashcard: number },
): any[] {
  const placeholders: any[] = [];
  let currentY = startY;

  if (effectiveTypes.has('note')) {
    placeholders.push({
      id: crypto.randomUUID(),
      type: 'note',
      name: 'Update me',
      subtitle: '',
      color: '#10B981',
      layout: { x: 0, y: currentY, w: 4, h: heights.note },
      data: { blockContent: [], field1: '' },
    });
    currentY += heights.note;
  }

  if (effectiveTypes.has('quiz')) {
    placeholders.push({
      id: crypto.randomUUID(),
      type: 'quiz',
      name: 'Update me',
      subtitle: '',
      color: '#F59E0B',
      layout: { x: 0, y: currentY, w: 2, h: 13 },
      data: { questions: [] },
    });
  }

  if (effectiveTypes.has('flashcard')) {
    placeholders.push({
      id: crypto.randomUUID(),
      type: 'flashcard',
      name: 'Update me',
      subtitle: '',
      color: '#EC4899',
      layout: { x: effectiveTypes.has('quiz') ? 2 : 0, y: currentY, w: 2, h: heights.flashcard },
      data: defaultDataFor('flashcard'),
    });
  }

  return placeholders;
}

function loadGenSettings(): GenerationSettings {
  if (typeof window === 'undefined') return DEFAULT_GEN_SETTINGS;
  try {
    const stored = localStorage.getItem('thinkex-gen-settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        auto: typeof parsed.auto === 'boolean' ? parsed.auto : true,
        types: Array.isArray(parsed.types) ? parsed.types : DEFAULT_GEN_SETTINGS.types,
      };
    }
  } catch {}
  return DEFAULT_GEN_SETTINGS;
}
// import type { ImageData } from "@/lib/workspace-state/types";

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
  uploadedFiles: UploadedPdfMetadata[];
  isUploading: boolean;
  removeFile: (fileUrl: string) => void;
  clearFiles: () => void;
  openFilePicker: () => void;
  uploadFiles: (files: File[]) => Promise<UploadedPdfMetadata[]>;
}

export function HomePromptInput({ shouldFocus, uploadedFiles, isUploading, removeFile, clearFiles, openFilePicker, uploadFiles }: HomePromptInputProps) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [value, setValue] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [prefixTyped, setPrefixTyped] = useState(false);
  const [typedPrefix, setTypedPrefix] = useState("");
  const [isUrlDialogOpen, setIsUrlDialogOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [genSettings, setGenSettings] = useState<GenerationSettings>(loadGenSettings);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingKeyRef = useRef(0);

  // Persist generation settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('thinkex-gen-settings', JSON.stringify(genSettings));
    } catch {}
  }, [genSettings]);

  const toggleGenType = (key: GenContentType) => {
    setGenSettings(prev => {
      const has = prev.types.includes(key);
      return {
        ...prev,
        types: has ? prev.types.filter(t => t !== key) : [...prev.types, key],
      };
    });
  };

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
    const prompt = value.trim();
    if (!prompt || createFromPrompt.isLoading || isUploading) return;

    const hasUploads = uploadedFiles.length > 0;

    // Determine effective content types based on settings
    // If auto or no valid types selected, use all defaults
    const effectiveTypes = new Set<GenContentType>(
      !genSettings.auto && genSettings.types.length > 0
        ? genSettings.types
        : ['note', 'quiz', 'flashcard', 'youtube']
    );
    const isCustom = !genSettings.auto && genSettings.types.length > 0;

    // Construct initial state with file cards AND empty placeholder cards if files were uploaded
    let initialState = undefined;
    if (hasUploads) {
      const fileHeight = 10;

      // Create PDF card items from uploaded files (stacked vertically at top)
      const pdfItems = uploadedFiles.map((file, index) => ({
        id: crypto.randomUUID(),
        type: 'pdf' as const,
        name: file.name,
        subtitle: '',
        color: '#6366F1' as const,
        layout: { x: 0, y: index * fileHeight, w: 4, h: fileHeight },
        lastSource: 'user' as const,
        data: {
          fileUrl: file.fileUrl,
          filename: file.filename,
          fileSize: file.fileSize,
        } as PdfData,
      }));

      const totalUploadY = uploadedFiles.length * fileHeight;

      // Build placeholder cards based on effective types, stacking layouts dynamically
      const placeholders = buildPlaceholderItems(effectiveTypes, totalUploadY, { note: 13, flashcard: 8 })
        .map(item => ({ ...item, lastSource: 'user' as const }));

      const allItems: any[] = [...pdfItems, ...placeholders];

      initialState = {
        workspaceId: '',
        globalTitle: '',
        globalDescription: '',
        items: allItems,
        itemsCreated: allItems.length,
      };
    }

    // For no-uploads path with custom settings, build a custom initial state
    // instead of using the getting_started template
    let template: "blank" | "getting_started";
    if (hasUploads) {
      template = "blank";
    } else if (isCustom) {
      template = "blank";
      const placeholders = buildPlaceholderItems(effectiveTypes, 0, { note: 9, flashcard: 9 });

      if (placeholders.length > 0) {
        initialState = {
          workspaceId: '',
          globalTitle: '',
          globalDescription: '',
          items: placeholders,
          itemsCreated: placeholders.length,
        };
      }
    } else {
      template = "getting_started";
    }

    createFromPrompt.mutate(prompt, {
      template,
      initialState,
      onSuccess: (workspace) => {
        typingKeyRef.current += 1;
        clearFiles();
        const url = `/workspace/${workspace.slug}`;
        const params = new URLSearchParams();

        if (hasUploads) {
          params.set('action', 'generate_study_materials');
        } else {
          params.set('createFrom', prompt);
        }

        // Pass custom generation types so AssistantPanel builds the right prompt
        if (isCustom) {
          params.set('genTypes', Array.from(effectiveTypes).join(','));
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
      <div className="relative">
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

        {/* // Uploaded images display */}
        {/* uploadedImages.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {uploadedImages.map((file) => (
              <div
                key={file.fileUrl}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-1.5",
                  "bg-foreground/5 border border-foreground/10",
                  "text-sm text-foreground/80"
                )}
              >
                <ImageIcon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate max-w-[200px]">{file.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(file.fileUrl);
                  }}
                  className="ml-1 hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) */}

        {/* Input container styled to look like one input */}
        <div
          onClick={() => inputRef.current?.focus()}
          className={cn(
            "relative w-full",
            isExpanded ? "rounded-[24px]" : "rounded-[32px]",
            "border",
            "bg-sidebar backdrop-blur-xl",
            "px-4 py-2 md:px-6 md:py-3",
            "pr-14 md:pr-16",
            "shadow-[0_24px_90px_-40px_rgba(0,0,0,0.85)]",
            "focus-within:border-foreground/40",
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

          <div className="mx-0 my-1 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent" />

          <div className="mt-0 flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => openFilePicker()}
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded-md",
                "text-[11px] text-sidebar-foreground/70",
                "hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
              )}
            >
              <FileText className="h-3 w-3" />
              <span>Upload PDF</span>
            </button>
            <button
              type="button"
              onClick={() => setIsUrlDialogOpen(true)}
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded-md",
                "text-[11px] text-sidebar-foreground/70",
                "hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
              )}
            >
              <LinkIcon className="h-3 w-3" />
              <span>Add URL</span>
            </button>

            <div className="ml-auto">
              <Popover onOpenChange={(open) => {
                  // Snap auto back on if user closes popover with no types selected
                  if (!open && !genSettings.auto && genSettings.types.length === 0) {
                    setGenSettings(prev => ({ ...prev, auto: true }));
                  }
                }}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-1 px-1.5 py-0.5 rounded-md",
                      "text-[11px] text-sidebar-foreground/70",
                      "hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                    )}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      genSettings.auto ? "bg-purple-500" : "bg-blue-500"
                    )} />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="end"
                  sideOffset={8}
                  className="w-44 p-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className={cn("space-y-2", genSettings.auto && "opacity-40 pointer-events-none")}>
                    {ALL_CONTENT_TYPES.map(({ key, label }) => {
                      const active = genSettings.types.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          role="switch"
                          aria-checked={active}
                          aria-label={`Toggle ${label}`}
                          className="flex items-center justify-between w-full"
                          onClick={() => toggleGenType(key)}
                        >
                          <span className="text-xs text-foreground">{label}</span>
                          <span
                            aria-hidden="true"
                            className={cn(
                              "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors",
                              active ? "bg-primary" : "bg-muted-foreground/25"
                            )}
                          >
                            <span
                              className={cn(
                                "pointer-events-none inline-block h-3 w-3 rounded-full bg-background shadow-sm ring-0 transition-transform mt-0.5",
                                active ? "translate-x-[14px]" : "translate-x-0.5"
                              )}
                            />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="my-2.5 h-px bg-border" />
                  <button
                    type="button"
                    role="switch"
                    aria-checked={genSettings.auto}
                    aria-label="Toggle auto generation"
                    className="flex items-center justify-between w-full"
                    onClick={() => setGenSettings(prev => ({ ...prev, auto: !prev.auto }))}
                  >
                    <span className="text-xs font-medium text-foreground">Auto</span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors",
                        genSettings.auto ? "bg-primary" : "bg-muted-foreground/25"
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-3 w-3 rounded-full bg-background shadow-sm ring-0 transition-transform mt-0.5",
                          genSettings.auto ? "translate-x-[14px]" : "translate-x-0.5"
                        )}
                      />
                    </span>
                  </button>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <button
            type="submit"
            disabled={!value.trim() || createFromPrompt.isLoading || isUploading}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "absolute right-3 md:right-4 top-1/2 -translate-y-1/2",
              "h-7 w-7 md:h-8 md:w-8 rounded-full",
              "flex items-center justify-center",
              "bg-background text-foreground border border-border",
              "transition-colors",
              "hover:bg-muted hover:border-border/80",
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
