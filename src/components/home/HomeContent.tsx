"use client";

import { useState, useRef, useEffect, useCallback, createContext, useContext } from "react";
import Image from "next/image";
import { HomePromptInput } from "./HomePromptInput";
import { DynamicTagline } from "./DynamicTagline";
import { WorkspaceGrid } from "./WorkspaceGrid";
import { HomeTopBar } from "./HomeTopBar";
import { FloatingWorkspaceCards } from "@/components/landing/FloatingWorkspaceCards";
import { HeroGlow } from "./HeroGlow";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FolderPlus, ChevronDown, Upload } from "lucide-react";
import { useCreateWorkspace } from "@/hooks/workspace/use-create-workspace";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useDropzone } from "react-dropzone";
import { usePdfUpload } from "@/hooks/workspace/use-pdf-upload";

// Context for section visibility - allows child components to know when to focus
const SectionVisibilityContext = createContext<{
  heroVisible: boolean;
  workspacesVisible: boolean;
}>({ heroVisible: true, workspacesVisible: false });

export const useSectionVisibility = () => useContext(SectionVisibilityContext);

export function HomeContent() {
  const router = useRouter();
  const [scrollY, setScrollY] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [heroVisible, setHeroVisible] = useState(true);

  const { workspaces, loadingWorkspaces } = useWorkspaceContext();
  const hasWorkspaces = !loadingWorkspaces && workspaces.length > 0;
  const createWorkspace = useCreateWorkspace();
  const { uploadFiles, uploadedFiles, isUploading, removeFile, clearFiles } = usePdfUpload();

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
    },
    multiple: true,
    noClick: true,
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        try {
          const uploaded = await uploadFiles(acceptedFiles);
          if (uploaded.length > 0) {
            toast.success(`Uploaded ${uploaded.length} PDF${uploaded.length > 1 ? 's' : ''}`);
          }
        } catch {
          toast.error("Failed to upload PDFs");
        }
      }
    },
  });

  const [workspacesVisible, setWorkspacesVisible] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const workspacesRef = useRef<HTMLDivElement>(null);

  // Scroll tracking
  useEffect(() => {
    const handleScroll = () => {
      if (scrollRef.current) {
        setScrollY(scrollRef.current.scrollTop);
        // Hide scroll hint as soon as user scrolls past the hero
        if (scrollRef.current.scrollTop >= 100) {
          setShowScrollHint(false);
        }
      }
    };

    const el = scrollRef.current;
    el?.addEventListener("scroll", handleScroll);
    return () => el?.removeEventListener("scroll", handleScroll);
  }, []);

  // IntersectionObserver for section visibility and focus management
  useEffect(() => {
    const heroEl = heroRef.current;
    const workspacesEl = workspacesRef.current;
    if (!heroEl || !workspacesEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === heroEl) {
            setHeroVisible(entry.isIntersecting && entry.intersectionRatio > 0.5);
          } else if (entry.target === workspacesEl) {
            setWorkspacesVisible(entry.isIntersecting && entry.intersectionRatio > 0.3);
          }
        });
      },
      {
        root: scrollRef.current,
        threshold: [0.3, 0.5],
      }
    );

    observer.observe(heroEl);
    observer.observe(workspacesEl);

    return () => observer.disconnect();
  }, []);

  // Mouse tracking for scroll hint pill — only track when hero is visible and workspaces aren't yet
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function handleMouseMove(e: MouseEvent) {
      if (!el) return;
      // Only show hint when near top of page (not scrolled) AND mouse in bottom 20%
      const rect = el.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const nearBottom = relativeY > rect.height * 0.8;
      const atTop = el.scrollTop < 100;
      setShowScrollHint(nearBottom && atTop);
    }

    function handleMouseLeave() {
      setShowScrollHint(false);
    }

    el.addEventListener("mousemove", handleMouseMove);
    el.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      el.removeEventListener("mousemove", handleMouseMove);
      el.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  const scrollToWorkspaces = useCallback(() => {
    workspacesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleCreateBlankWorkspace = () => {
    // Guard against multiple rapid clicks
    if (createWorkspace.isPending) return;

    createWorkspace.mutate(
      {
        name: "Blank Workspace",
        icon: null,
        color: null,
      },
      {
        onSuccess: ({ workspace }) => {
          router.push(`/workspace/${workspace.slug}`);
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : "Something went wrong";
          toast.error("Could not create workspace", { description: msg });
        },
      }
    );
  };

  return (
    <>
      {/* Fixed Top Bar */}
      <HomeTopBar
        scrollY={scrollY}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        shouldFocusSearch={workspacesVisible}
      />

      {/* Scrollable Content */}
      <div ref={scrollRef} className="relative h-full w-full overflow-y-auto">
        {/* Floating Card Background with spotlight reveal effect */}
        <div className="absolute inset-x-0 top-0 h-[185vh] z-0 select-none overflow-hidden">
          <FloatingWorkspaceCards
            bottomGradientHeight="40%"
            includeExtraCards={true}
          />
        </div>

        {/* Gradient fade from hero to workspaces section */}
        <div
          className="fixed bottom-0 left-0 right-0 h-[40vh] pointer-events-none z-[5]"
          style={{
            background: 'linear-gradient(to bottom, transparent 0%, hsl(var(--background)) 100%)',
          }}
        />

        {/* Scroll hint arrow — appears when cursor enters bottom 20% */}
        <div
          className={cn(
            "fixed bottom-8 left-1/2 -translate-x-1/2 z-[20] transition-all duration-300 ease-out",
            showScrollHint && hasWorkspaces
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-2 pointer-events-none"
          )}
        >
          <button
            type="button"
            onClick={scrollToWorkspaces}
            className="flex items-center justify-center w-8 h-8 rounded-full text-background hover:text-background bg-foreground border border-border transition-colors duration-200 cursor-pointer"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        {/* Hero Section - Full dropzone */}
        <div
          ref={heroRef}
          {...getRootProps()}
          className="relative z-10 h-[75vh] flex flex-col items-center justify-center text-center px-6"
        >
          <input {...getInputProps()} />

          {/* Full-page drag overlay */}
          {isDragActive && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3 text-foreground">
                <div className="flex items-center justify-center w-16 h-16 rounded-2xl border-2 border-dashed border-foreground/40 bg-muted/50">
                  <Upload className="h-8 w-8" />
                </div>
                <p className="text-lg font-medium">Drop PDFs here</p>
                <p className="text-sm text-muted-foreground">Files will be added to your new workspace</p>
              </div>
            </div>
          )}

          <div className="w-full max-w-[760px] relative">
            {/* Hero Glow Effect */}
            <HeroGlow />

            {/* Social proof */}
            <div className="mb-12 flex flex-wrap items-center justify-center gap-3 text-xs sm:text-sm relative z-10">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/10 text-sidebar-foreground">
                <div className="flex -space-x-2">
                  {[
                    "bg-gradient-to-br from-blue-400 to-blue-600",
                    "bg-gradient-to-br from-emerald-400 to-emerald-600",
                    "bg-gradient-to-br from-amber-400 to-amber-600",
                    "bg-gradient-to-br from-rose-400 to-rose-600",
                  ].map((gradient, i) => (
                    <div
                      key={gradient}
                      className={`w-5 h-5 rounded-full ${gradient} flex items-center justify-center text-white text-[9px] font-medium shadow-sm`}
                    >
                      {["T", "J", "A", "M"][i]}
                    </div>
                  ))}
                </div>
                <span className="text-xs sm:text-sm font-medium text-muted-foreground">100+ daily active users</span>
              </div>
            </div>

            {/* Dynamic tagline with mask wipe animation */}
            <div className="mb-6 relative z-10">
              <DynamicTagline />
            </div>
            <div className="flex justify-center w-full relative z-10">
              <HomePromptInput
                shouldFocus={heroVisible}
                uploadedFiles={uploadedFiles}
                isUploading={isUploading}
                removeFile={removeFile}
                clearFiles={clearFiles}
                openFilePicker={open}
                uploadFiles={uploadFiles}
              />
            </div>

            {/* Start from scratch button */}
            <div className="flex justify-center w-full relative z-10 mt-6">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCreateBlankWorkspace}
                disabled={createWorkspace.isPending}
                className="text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 gap-2 disabled:opacity-50"
              >
                <FolderPlus className="h-4 w-4" />
                Or, start from scratch
              </Button>
            </div>
          </div>
        </div>

        {/* Workspaces Section - Allow scrolling within */}
        <div ref={workspacesRef} className="relative z-10 px-6 pb-8 pt-8 min-h-screen bg-gradient-to-b from-transparent via-background to-background">
          <div className="w-full max-w-6xl mx-auto h-full">
            {/* Your Workspaces */}
            <div className="bg-sidebar backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-2xl">
              <h2 className="text-lg font-normal text-muted-foreground mb-4">Recent workspaces</h2>
              <WorkspaceGrid searchQuery={searchQuery} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
