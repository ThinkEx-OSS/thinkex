"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCreateWorkspaceFromPrompt } from "@/hooks/workspace/use-create-workspace";
import type { UploadedPdfMetadata } from "@/hooks/workspace/use-pdf-upload";
// import { useImageUpload } from "@/hooks/workspace/use-image-upload";
import { ArrowUp, FileText, Loader2, X, Link as LinkIcon } from "lucide-react";
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
import type { PdfData } from "@/lib/workspace-state/types";
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
    const prompt = value.trim();
    if (!prompt || createFromPrompt.isLoading || isUploading) return;

    const hasUploads = uploadedFiles.length > 0;

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
        color: '#6366F1' as const, // Indigo for PDFs
        layout: { x: 0, y: index * fileHeight, w: 4, h: fileHeight },
        lastSource: 'user' as const,
        data: {
          fileUrl: file.fileUrl,
          filename: file.filename,
          fileSize: file.fileSize,
        } as PdfData,
      }));

      const totalUploadY = uploadedFiles.length * fileHeight;

      // const pdfEndY = uploadedFiles.length * fileHeight;

      // // Create Image card items (stacked below PDFs)
      // const imageItems = uploadedImages.map((file, index) => ({
      //   id: crypto.randomUUID(),
      //   type: 'image' as const,
      //   name: file.name,
      //   subtitle: '',
      //   color: '#8B5CF6' as const, // Violet for Images
      //   layout: { x: 0, y: pdfEndY + index * fileHeight, w: 4, h: fileHeight },
      //   lastSource: 'user' as const,
      //   data: {
      //     fileUrl: file.fileUrl,
      //     filename: file.filename,
      //     fileSize: file.fileSize,
      //   } as ImageData,
      // }));

      // const totalUploadY = pdfEndY + uploadedImages.length * fileHeight;

      // Create empty placeholder cards with fixed layout and colors
      const emptyNote = {
        id: crypto.randomUUID(),
        type: 'note' as const,
        name: 'Update me',
        subtitle: '',
        color: '#10B981' as const,
        layout: { x: 0, y: totalUploadY, w: 4, h: 13 },
        lastSource: 'user' as const,
        data: { blockContent: [], field1: '' },
      };

      const emptyQuiz = {
        id: crypto.randomUUID(),
        type: 'quiz' as const,
        name: 'Update me',
        subtitle: '',
        color: '#F59E0B' as const,
        layout: { x: 0, y: totalUploadY + 13, w: 2, h: 13 },
        lastSource: 'user' as const,
        data: { questions: [] },
      };

      const emptyFlashcard = {
        id: crypto.randomUUID(),
        type: 'flashcard' as const,
        name: 'Update me',
        subtitle: '',
        color: '#EC4899' as const,
        layout: { x: 2, y: totalUploadY + 13, w: 2, h: 8 },
        lastSource: 'user' as const,
        data: { cards: [] },
      };

      const allItems = [...pdfItems, emptyNote, emptyQuiz, emptyFlashcard];

      initialState = {
        workspaceId: '',
        globalTitle: '',
        globalDescription: '',
        items: allItems,
        itemsCreated: allItems.length,
      };
    }

    createFromPrompt.mutate(prompt, {
      template: hasUploads ? "blank" : "getting_started",
      initialState,
      onSuccess: (workspace) => {
        typingKeyRef.current += 1;
        clearFiles();
        // clearImages();
        const url = `/workspace/${workspace.slug}`;
        const params = new URLSearchParams();

        if (hasUploads) {
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
            {/* <button
              type="button"
              onClick={() => openImagePicker()}
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded-md",
                "text-[11px] text-sidebar-foreground/70",
                "hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
              )}
            >
              <ImageIcon className="h-3 w-3" />
              <span>Add Image</span>
            </button> */}
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
