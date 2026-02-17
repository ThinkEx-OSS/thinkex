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
import { FolderPlus, ChevronDown } from "lucide-react";
import { useCreateWorkspace } from "@/hooks/workspace/use-create-workspace";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { HomeAttachmentsProvider, useHomeAttachments } from "@/contexts/HomeAttachmentsContext";
import { LinkInputDialog } from "./LinkInputDialog";

// Context for section visibility - allows child components to know when to focus
const SectionVisibilityContext = createContext<{
  heroVisible: boolean;
  workspacesVisible: boolean;
}>({ heroVisible: true, workspacesVisible: false });

export const useSectionVisibility = () => useContext(SectionVisibilityContext);

import { HomeActionCards } from "./HomeActionCards";
import { RecordWorkspaceDialog, OPEN_RECORD_PARAM } from "@/components/modals/RecordWorkspaceDialog";

const ACCEPT_FILES = "application/pdf,image/*,audio/*";

interface HeroAttachmentsSectionProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  showLinkDialog: boolean;
  setShowLinkDialog: (open: boolean) => void;
  handleCreateBlankWorkspace: () => void;
  createWorkspacePending: boolean;
  onRecord: () => void;
  heroVisible: boolean;
  showPromptInput: boolean;
  onRequestShowPromptInput: () => void;
  pastedText: string | null;
  onPastedText: (text: string) => void;
  onClearPastedText: () => void;
}

function HeroAttachmentsSection({
  fileInputRef,
  showLinkDialog,
  setShowLinkDialog,
  handleCreateBlankWorkspace,
  createWorkspacePending,
  onRecord,
  heroVisible,
  showPromptInput,
  onRequestShowPromptInput,
  pastedText,
  onPastedText,
  onClearPastedText,
}: HeroAttachmentsSectionProps) {
  const { addFiles, addLink, canAddMoreLinks, canAddYouTube } = useHomeAttachments();

  const handleUpload = () => fileInputRef.current?.click();

  const uploadInputId = "home-file-upload";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      addFiles(Array.from(files));
      onRequestShowPromptInput();
    }
    e.target.value = "";
  };

  const handleAddLink = (url: string) => {
    addLink(url);
    onRequestShowPromptInput();
  };

  const handlePasteText = async () => {
    try {
      const text = await navigator.clipboard.readText();
      onRequestShowPromptInput();
      if (text.trim()) {
        onPastedText(text.trim());
      }
    } catch {
      onRequestShowPromptInput();
      toast.error("Could not read clipboard. Check permissions or try pasting manually.");
    }
  };

  return (
    <>
      <Input
        id={uploadInputId}
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_FILES}
        multiple
        className="sr-only"
        onChange={handleFileChange}
      />
      <div className="flex justify-center w-full relative z-10 mb-2">
        <HomeActionCards
          onUpload={handleUpload}
          onLink={() => setShowLinkDialog(true)}
          onPasteText={handlePasteText}
          onRecord={onRecord}
          onStartFromScratch={handleCreateBlankWorkspace}
          isLoading={createWorkspacePending}
          uploadInputId={uploadInputId}
        />
      </div>
      {showPromptInput && (
        <div className="flex justify-center w-full relative z-10">
          <HomePromptInput
            shouldFocus={heroVisible}
            initialValue={pastedText ?? undefined}
            onInitialValueApplied={onClearPastedText}
          />
        </div>
      )}
      <LinkInputDialog
        open={showLinkDialog}
        onOpenChange={setShowLinkDialog}
        onAdd={handleAddLink}
        canAddMoreLinks={canAddMoreLinks}
        canAddYouTube={canAddYouTube}
      />
    </>
  );
}

export function HomeContent() {
  const router = useRouter();
  const [scrollY, setScrollY] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [heroVisible, setHeroVisible] = useState(true);

  const { workspaces, loadingWorkspaces } = useWorkspaceContext();
  const hasWorkspaces = !loadingWorkspaces && workspaces.length > 0;
  const createWorkspace = useCreateWorkspace();

  const [showRecordDialog, setShowRecordDialog] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [pastedText, setPastedText] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleRecordInNewWorkspace = () => {
    if (createWorkspace.isPending) return;
    setShowRecordDialog(false);
    createWorkspace.mutate(
      {
        name: "Recording",
        icon: null,
        color: null,
      },
      {
        onSuccess: ({ workspace }) => {
          router.push(`/workspace/${workspace.slug}?${OPEN_RECORD_PARAM}=1`);
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : "Something went wrong";
          toast.error("Could not create workspace", { description: msg });
        },
      }
    );
  };

  const handleRecordInExistingWorkspace = (slug: string) => {
    setShowRecordDialog(false);
    router.push(`/workspace/${slug}?${OPEN_RECORD_PARAM}=1`);
  };

  return (
    <>
      <RecordWorkspaceDialog
        open={showRecordDialog}
        onOpenChange={setShowRecordDialog}
        workspaces={workspaces}
        loadingWorkspaces={loadingWorkspaces}
        onSelectNew={handleRecordInNewWorkspace}
        onSelectExisting={handleRecordInExistingWorkspace}
        createWorkspacePending={createWorkspace.isPending}
      />

      {/* Fixed Top Bar */}
      <HomeTopBar
        scrollY={scrollY}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
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

        {/* Hero Section */}
        <div
          ref={heroRef}
          className="relative z-10 h-[75vh] flex flex-col items-center justify-center text-center px-6"
        >

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
            <div className="mb-10 relative z-10">
              <DynamicTagline />
            </div>

            <HomeAttachmentsProvider>
              <HeroAttachmentsSection
                fileInputRef={fileInputRef}
                showLinkDialog={showLinkDialog}
                setShowLinkDialog={setShowLinkDialog}
                handleCreateBlankWorkspace={handleCreateBlankWorkspace}
                createWorkspacePending={createWorkspace.isPending}
                onRecord={() => setShowRecordDialog(true)}
                heroVisible={heroVisible}
                showPromptInput={showPromptInput}
                onRequestShowPromptInput={() => setShowPromptInput(true)}
                pastedText={pastedText}
                onPastedText={setPastedText}
                onClearPastedText={() => setPastedText(null)}
              />
            </HomeAttachmentsProvider>
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
