"use client";

import { useState, useRef, useEffect, createContext, useContext } from "react";
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
import { FolderPlus, Github } from "lucide-react";
import { useCreateWorkspace } from "@/hooks/workspace/use-create-workspace";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

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

  const createWorkspace = useCreateWorkspace();
  const [workspacesVisible, setWorkspacesVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const workspacesRef = useRef<HTMLDivElement>(null);

  // Scroll tracking
  useEffect(() => {
    const handleScroll = () => {
      if (scrollRef.current) {
        setScrollY(scrollRef.current.scrollTop);
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

        {/* Hero Section - Reduced height so "Recent workspaces" text peeks at bottom */}
        <div ref={heroRef} className="relative z-10 h-[85vh] flex flex-col items-center justify-center text-center px-6">
          <div className="w-full max-w-[760px] relative">
            {/* Hero Glow Effect */}
            <HeroGlow />

            {/* Social proof */}
            <div className="mb-6 flex flex-wrap items-center justify-center gap-3 text-xs sm:text-sm relative z-10">
              <div className="flex items-center gap-2 px-2.5 py-1 text-sidebar-foreground">
                <div className="flex -space-x-2">
                  {[
                    "bg-gradient-to-br from-blue-400 to-blue-600",
                    "bg-gradient-to-br from-emerald-400 to-emerald-600",
                    "bg-gradient-to-br from-amber-400 to-amber-600",
                    "bg-gradient-to-br from-rose-400 to-rose-600",
                  ].map((gradient, i) => (
                    <div
                      key={gradient}
                      className={`w-6 h-6 rounded-full ${gradient} flex items-center justify-center text-foreground text-[10px] font-medium shadow-sm dark:text-white`}
                    >
                      {["T", "J", "A", "M"][i]}
                    </div>
                  ))}
                </div>
                <span className="text-xs sm:text-sm font-normal">100+ daily active users</span>
              </div>
            </div>

            {/* Dynamic tagline with mask wipe animation */}
            <div className="mb-6 relative z-10">
              <DynamicTagline />
            </div>
            <div className="flex justify-center w-full relative z-10">
              <HomePromptInput shouldFocus={heroVisible} />
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
            <div className="bg-sidebar rounded-md p-6">
              <h2 className="text-lg font-normal text-muted-foreground mb-4">Recent workspaces</h2>
              <WorkspaceGrid searchQuery={searchQuery} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
