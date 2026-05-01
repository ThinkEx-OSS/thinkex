"use client";

import { FloatingWorkspaceCards } from "@/components/background/FloatingWorkspaceCards";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Input } from "@/components/ui/input";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import {
  HomeAttachmentsProvider,
  useHomeAttachments,
} from "@/contexts/HomeAttachmentsContext";
import { useCreateWorkspace } from "@/hooks/workspace/use-create-workspace";
import { useAudioRecordingStore } from "@/lib/stores/audio-recording-store";
import { cn } from "@/lib/utils";
import {
  HOME_UPLOAD_ACCEPT_STRING,
  isStudyDocumentFile,
} from "@/lib/uploads/accepted-file-types";
import { ChevronDown } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DemoVideoSection } from "./DemoVideoSection";
import { DynamicTagline } from "./DynamicTagline";
import { HeroGlow } from "./HeroGlow";
import { HomeActionCards } from "./HomeActionCards";
import { HomeHeroDropzone } from "./HomeHeroDropzone";
import type { InitialAuth } from "./HomeShell";
import { HomeTopBar } from "./HomeTopBar";
import { WorkspaceGrid } from "./WorkspaceGrid";

const RecordWorkspaceDialog = dynamic(
  () =>
    import("@/components/modals/RecordWorkspaceDialog").then((mod) => ({
      default: mod.RecordWorkspaceDialog,
    })),
  { ssr: false },
);
const LinkInputDialog = dynamic(
  () =>
    import("./LinkInputDialog").then((mod) => ({
      default: mod.LinkInputDialog,
    })),
  { ssr: false },
);
const HomePromptInput = dynamic(
  () =>
    import("./HomePromptInput").then((mod) => ({
      default: mod.HomePromptInput,
    })),
  { ssr: false },
);

interface HeroAttachmentsSectionProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  showLinkDialog: boolean;
  setShowLinkDialog: (open: boolean) => void;
  createWorkspacePending: boolean;
  onRecord: () => void;
  heroVisible: boolean;
  showPromptInput: boolean;
  onRequestShowPromptInput: () => void;
  pastedText: string | null;
  onPastedText: (text: string) => void;
  onClearPastedText: () => void;
}

interface HomeContentProps {
  showDemoVideo: boolean;
  initialAuth: InitialAuth;
}

async function getClipboardImage(): Promise<File | null> {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith("image/")) {
          const blob = await item.getType(type);
          const ext =
            type === "image/png"
              ? "png"
              : type === "image/jpeg" || type === "image/jpg"
                ? "jpg"
                : type === "image/gif"
                  ? "gif"
                  : type === "image/webp"
                    ? "webp"
                    : "png";
          return new File([blob], `image-${Date.now()}.${ext}`, { type });
        }
      }
    }
  } catch {}
  return null;
}

function HeroAttachmentsSection({
  fileInputRef,
  showLinkDialog,
  setShowLinkDialog,
  createWorkspacePending,
  onRecord,
  heroVisible,
  showPromptInput,
  onRequestShowPromptInput,
  pastedText,
  onPastedText,
  onClearPastedText,
}: HeroAttachmentsSectionProps) {
  const { addFiles, addLink, canAddMoreLinks, canAddYouTube } =
    useHomeAttachments();

  const handleUpload = () => fileInputRef.current?.click();
  const uploadInputId = "home-file-upload";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const hasDocument = Array.from(files).some(isStudyDocumentFile);
      if (hasDocument && !pastedText) {
        onPastedText(
          "Analyze this document and extract its core concepts. Create a detailed study guide summarizing the main ideas and generate a practice quiz to test my understanding.",
        );
      }
      addFiles(Array.from(files));
      onRequestShowPromptInput();
    }
    e.target.value = "";
  };

  const handleAddLink = (url: string) => {
    if (!pastedText) {
      onPastedText(
        "Analyze this content and extract its core concepts. Create a detailed study guide summarizing the main ideas and generate a practice quiz to test my understanding.",
      );
    }
    addLink(url);
    onRequestShowPromptInput();
  };

  const handlePasteText = async () => {
    const clipboardImage = await getClipboardImage();
    if (clipboardImage) {
      await addFiles([clipboardImage]);
      onRequestShowPromptInput();
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      onRequestShowPromptInput();
      if (text.trim()) {
        onPastedText(text.trim());
      }
    } catch {
      onRequestShowPromptInput();
      toast.error(
        "Could not read clipboard. Check permissions or try pasting manually.",
      );
    }
  };

  return (
    <>
      <Input
        id={uploadInputId}
        ref={fileInputRef}
        type="file"
        accept={HOME_UPLOAD_ACCEPT_STRING}
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

export function HomeContent({ showDemoVideo, initialAuth }: HomeContentProps) {
  const router = useRouter();
  const setShouldOpenOnWorkspaceLoad = useAudioRecordingStore(
    (s) => s.setShouldOpenOnWorkspaceLoad,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [heroVisible, setHeroVisible] = useState(true);
  const [showTopBarBg, setShowTopBarBg] = useState(false);
  const [showTopBarSearch, setShowTopBarSearch] = useState(false);

  const { workspaces, loadingWorkspaces } = useWorkspaceContext();
  const hasWorkspaces = !loadingWorkspaces && workspaces.length > 0;
  const effectiveShowDemo = showDemoVideo && !hasWorkspaces;
  const createWorkspace = useCreateWorkspace();

  const [showRecordDialog, setShowRecordDialog] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [pastedText, setPastedText] = useState<string | null>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const workspacesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!scrollRef.current) return;
      const y = scrollRef.current.scrollTop;
      setShowTopBarBg(y > 200);
      setShowTopBarSearch(y > 300);
      if (y >= 100) setShowScrollHint(false);
    };
    const el = scrollRef.current;
    el?.addEventListener("scroll", handleScroll, { passive: true });
    return () => el?.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const heroEl = heroRef.current;
    const workspacesEl = workspacesRef.current;
    if (!heroEl || !workspacesEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === heroEl) {
            setHeroVisible(
              entry.isIntersecting && entry.intersectionRatio > 0.5,
            );
          }
        });
      },
      {
        root: scrollRef.current,
        threshold: [0.3, 0.5],
      },
    );

    observer.observe(heroEl);
    observer.observe(workspacesEl);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let rafId: number | null = null;

    function handleMouseMove(e: MouseEvent) {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const currentEl = scrollRef.current;
        if (!currentEl) return;
        const rect = currentEl.getBoundingClientRect();
        const relativeY = e.clientY - rect.top;
        const nearBottom = relativeY > rect.height * 0.8;
        const atTop = currentEl.scrollTop < 100;
        setShowScrollHint(nearBottom && atTop);
      });
    }

    function handleMouseLeave() {
      setShowScrollHint(false);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    el.addEventListener("mousemove", handleMouseMove);
    el.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      el.removeEventListener("mousemove", handleMouseMove);
      el.removeEventListener("mouseleave", handleMouseLeave);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  const scrollToWorkspaces = useCallback(() => {
    workspacesRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

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
          setShouldOpenOnWorkspaceLoad(true);
          router.push(`/workspace/${workspace.slug}`);
        },
        onError: (err) => {
          const msg =
            err instanceof Error ? err.message : "Something went wrong";
          toast.error("Could not create workspace", { description: msg });
        },
      },
    );
  };

  const handleRecordInExistingWorkspace = (slug: string) => {
    setShowRecordDialog(false);
    setShouldOpenOnWorkspaceLoad(true);
    router.push(`/workspace/${slug}`);
  };

  const handleRecord = () => {
    if (!loadingWorkspaces && workspaces.length === 0) {
      handleRecordInNewWorkspace();
    } else {
      setShowRecordDialog(true);
    }
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

      <HomeTopBar
        showBackground={showTopBarBg}
        showSearch={!effectiveShowDemo && showTopBarSearch}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        initialAuth={initialAuth}
      />

      <HomeAttachmentsProvider>
        <HomeHeroDropzone onFilesDropped={() => setShowPromptInput(true)}>
          <div
            ref={scrollRef}
            className="relative h-full w-full overflow-y-auto"
          >
            <div className="absolute inset-x-0 top-0 h-[185vh] z-0 select-none overflow-hidden">
              <FloatingWorkspaceCards bottomGradientHeight="40%" />
            </div>

            {effectiveShowDemo && (
              <div
                className="fixed bottom-0 left-0 right-0 h-[40vh] pointer-events-none z-[5]"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent 0%, var(--background) 100%)",
                }}
              />
            )}

            <div
              className={cn(
                "fixed bottom-8 left-1/2 -translate-x-1/2 z-[20] transition-all duration-300 ease-out",
                showScrollHint && hasWorkspaces && !effectiveShowDemo
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-2 pointer-events-none",
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

            <div
              ref={heroRef}
              className="relative z-10 h-[75vh] flex flex-col items-center justify-center text-center px-6"
            >
              <div className="w-full max-w-[760px] relative">
                <HeroGlow />

                <div className="mb-10 relative z-10">
                  <DynamicTagline />
                </div>

                <HeroAttachmentsSection
                  fileInputRef={fileInputRef}
                  showLinkDialog={showLinkDialog}
                  setShowLinkDialog={setShowLinkDialog}
                  createWorkspacePending={createWorkspace.isPending}
                  onRecord={handleRecord}
                  heroVisible={heroVisible}
                  showPromptInput={showPromptInput}
                  onRequestShowPromptInput={() => setShowPromptInput(true)}
                  pastedText={pastedText}
                  onPastedText={setPastedText}
                  onClearPastedText={() => setPastedText(null)}
                />
              </div>
            </div>

            <div
              ref={workspacesRef}
              className={cn(
                "relative z-10 px-6 pb-8 pt-8 bg-gradient-to-b from-transparent via-background to-background",
                effectiveShowDemo && "min-h-screen",
              )}
            >
              <div className="w-full max-w-6xl mx-auto h-full">
                {effectiveShowDemo ? (
                  <DemoVideoSection />
                ) : (
                  <div className="bg-sidebar backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-2xl">
                    <h2 className="text-lg font-normal text-muted-foreground mb-4">
                      Recent workspaces
                    </h2>
                    <WorkspaceGrid searchQuery={searchQuery} />
                  </div>
                )}
              </div>
            </div>

            <div className="relative z-10">
              <SiteFooter />
            </div>
          </div>
        </HomeHeroDropzone>
      </HomeAttachmentsProvider>
    </>
  );
}
