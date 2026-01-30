"use client";

import { useState, useRef, useEffect, useCallback, createContext, useContext } from "react";
import { HomePromptInput } from "./HomePromptInput";
import { DynamicTagline } from "./DynamicTagline";
import { WorkspaceGrid } from "./WorkspaceGrid";
import { HomeTopBar } from "./HomeTopBar";
import { FloatingWorkspaceCards } from "@/components/landing/FloatingWorkspaceCards";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FolderPlus } from "lucide-react";

// Context for section visibility - allows child components to know when to focus
const SectionVisibilityContext = createContext<{
  heroVisible: boolean;
  workspacesVisible: boolean;
}>({ heroVisible: true, workspacesVisible: false });

export const useSectionVisibility = () => useContext(SectionVisibilityContext);

export function HomeContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [scrollY, setScrollY] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [mousePosition, setMousePosition] = useState({ x: 0.5, y: 0.5 });
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [heroVisible, setHeroVisible] = useState(true);
  const [workspacesVisible, setWorkspacesVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const workspacesRef = useRef<HTMLDivElement>(null);
  const rippleIdRef = useRef(0);
  const rippleTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

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

  // Mouse tracking for hero glow intensity
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Click ripple effect
  const handleClick = useCallback((e: React.MouseEvent) => {
    // Skip ripple if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, [role="button"]')) return;

    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;
    const id = rippleIdRef.current++;

    setRipples(prev => [...prev, { id, x, y }]);

    // Remove ripple after animation completes (1.2s)
    const timeoutId = setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id));
      rippleTimeoutsRef.current.delete(timeoutId);
    }, 1200);
    rippleTimeoutsRef.current.add(timeoutId);
  }, []);

  // Cleanup ripple timeouts on unmount
  useEffect(() => {
    const timeouts = rippleTimeoutsRef.current;
    return () => {
      timeouts.forEach(clearTimeout);
    };
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

  // Calculate glow intensity based on distance from hero center
  const centerX = 0.5;
  const centerY = 0.45; // Hero is slightly above center
  const distance = Math.sqrt(
    Math.pow(mousePosition.x - centerX, 2) +
    Math.pow(mousePosition.y - centerY, 2)
  );
  // Glow is strongest at center (distance=0), fades as you move away
  const glowIntensity = Math.max(0, 1 - distance * 2);

  const handleCreateBlankWorkspace = async () => {
    // Guard against multiple rapid clicks
    if (isCreatingWorkspace) return;

    setIsCreatingWorkspace(true);
    try {
      const createRes = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Blank Workspace",
          icon: null,
          color: null,
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create workspace");
      }
      const { workspace } = (await createRes.json()) as { workspace: { slug: string } };

      // Invalidate workspaces cache so the new workspace is available immediately
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });

      router.push(`/workspace/${workspace.slug}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error("Could not create workspace", { description: msg });
    } finally {
      setIsCreatingWorkspace(false);
    }
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

      {/* Scrollable Content - scroll-pt-20 creates 80px hero peek when snapped to workspaces */}
      <div ref={scrollRef} className="relative h-full w-full overflow-y-auto snap-y snap-mandatory scroll-pt-20" onClick={handleClick}>
        {/* Floating Card Background with spotlight reveal effect */}
        <div className="absolute inset-x-0 top-0 h-[185vh] z-0 select-none pointer-events-none overflow-hidden">
          <FloatingWorkspaceCards
            bottomGradientHeight="40%"
            includeExtraCards={true}
            mousePosition={mousePosition}
            ripples={ripples}
            scrollY={scrollY}
            heroGlowIntensity={glowIntensity}
            heroYPosition={centerY}
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
        <div ref={heroRef} className="relative z-10 h-[85vh] flex flex-col items-center justify-center text-center px-6 snap-start">
          <div className="w-full max-w-2xl relative">
            {/* Hero glow - intensifies on mouse approach, slight purple hue */}
            <div
              className="absolute -inset-20 rounded-3xl pointer-events-none transition-opacity duration-300"
              style={{
                background: `radial-gradient(ellipse at center,
                  rgba(156, 146, 250, ${0.95 + glowIntensity * 0.05}) 0%,
                  rgba(167, 139, 250, ${0.8 + glowIntensity * 0.1}) 35%,
                  rgba(140, 130, 220, 0.12) 80%,
                  rgba(130, 120, 200, 0.05) 100%)`,
                filter: `blur(${35 + glowIntensity * 25}px)`,
                opacity: 1,
                zIndex: 0,
              }}
            />
            {/* Dark ambient blur for text readability */}
            <div
              className="absolute -inset-8 rounded-3xl pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.25) 40%, transparent 70%)',
                filter: 'blur(20px)',
                zIndex: 1,
              }}
            />

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
                disabled={isCreatingWorkspace}
                className="text-sm text-white/70 hover:text-white hover:bg-white/5 transition-all duration-200 gap-2 disabled:opacity-50"
              >
                <FolderPlus className="h-4 w-4" />
                Or, start from scratch
              </Button>
            </div>
          </div>
        </div>

        {/* Workspaces Section - Exactly viewport height, no overscroll */}
        <div ref={workspacesRef} className="relative z-10 px-6 pb-8 pt-8 h-screen snap-start snap-always scroll-mt-0 bg-gradient-to-b from-transparent via-background to-black overflow-hidden">
          <div className="w-full max-w-6xl mx-auto h-full overflow-y-auto">
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
