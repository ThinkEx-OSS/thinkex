"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Move, SquarePen, FileSearch, Youtube, Share2, ChevronLeft, ChevronRight, X, ArrowRight } from "lucide-react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export interface WorkspaceInstructionModalProps {
  open: boolean;
  canClose: boolean;
  showFallback: boolean;
  onRequestClose?: () => void;
  onFallbackContinue?: () => void;
  onUserInteracted?: () => void;
  isGenerating?: boolean;
  /** Progress text shown at top when generating (e.g. "Creating your note...") */
  progressText?: string;
  /** Steps completed so far (e.g. ["metadata", "workspace", "note"]) */
  completedSteps?: string[];
  /** Total number of steps for progress indicator */
  totalSteps?: number;
  /** When true and workspaceSlug is set, shows "Open workspace" button instead of auto-redirecting (used when user interacted during generation) */
  generationComplete?: boolean;
  workspaceSlug?: string | null;
  onOpenWorkspace?: () => void;
}

interface Step {
  icon: typeof Move;
  label: string;
  video?: { dark: string; light: string };
}

const VIDEO_BASE = "https://uxcoymwbfcbvkgwbhttq.supabase.co/storage/v1/object/public/video";

// Order front-loads cooler / less intuitive features so drop-off users still see the wow moments
const STEPS: Step[] = [
  {
    icon: SquarePen,
    label: "Upload a PDF, AI makes summaries & study guides",
    video: { dark: `${VIDEO_BASE}/step-2-generate-card-dark-3.mp4`, light: `${VIDEO_BASE}/step-2-generate-card-light-3.mp4` },
  },
  {
    icon: FileSearch,
    label: "Select cards & chat with AI for answers from your materials",
    video: { dark: `${VIDEO_BASE}/step-3-pdf-ss-dark.mp4`, light: `${VIDEO_BASE}/step-3-pdf-ss-light.mp4` },
  },
  {
    icon: SquarePen,
    label: "Type a prompt, AI creates study materials",
    video: { dark: `${VIDEO_BASE}/step-2-generate-card-dark-1.mp4`, light: `${VIDEO_BASE}/step-2-generate-card-light-1.mp4` },
  },
  {
    icon: SquarePen,
    label: "Select cards, AI generates notes from their content",
    video: { dark: `${VIDEO_BASE}/step-2-generate-card-dark-2.mp4`, light: `${VIDEO_BASE}/step-2-generate-card-light-2.mp4` },
  },
  {
    icon: Youtube,
    label: "Paste or drag YouTube links next to your notes",
    video: { dark: `${VIDEO_BASE}/step-4-youtube-dark.mp4`, light: `${VIDEO_BASE}/step-4-youtube-light.mp4` },
  },
  {
    icon: Move,
    label: "Drag, resize & organize cards on your grid",
    video: { dark: `${VIDEO_BASE}/step-1-arrange-dark.mp4`, light: `${VIDEO_BASE}/step-1-arrange-light.mp4` },
  },
  {
    icon: Share2,
    label: "Share your workspace to collaborate in real time",
    video: { dark: `${VIDEO_BASE}/step-5-collab-dark.mp4`, light: `${VIDEO_BASE}/step-5-collab-light.mp4` },
  },
];

const ICON_SLIDE_MS = 4000;
const FADE_MS = 250;

function useCarousel(open: boolean) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  // Reset carousel state when modal closes so re-opening starts from slide 0
  useEffect(() => {
    if (!open) {
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
        fadeTimeoutRef.current = null;
      }
      setActiveIndex(0);
      setVisibleIndex(0);
      setFading(false);
      setVideoLoaded(false);
      pausedRef.current = false;
    }
  }, [open]);

  // Transition: fade out → swap → fade in
  const transitionTo = useCallback((nextIndex: number) => {
    if (nextIndex === visibleIndex) return;
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = null;
    }
    setFading(true);
    setVideoLoaded(false);
    fadeTimeoutRef.current = setTimeout(() => {
      setActiveIndex(nextIndex);
      setVisibleIndex(nextIndex);
      setFading(false);
      fadeTimeoutRef.current = null;
    }, FADE_MS);
  }, [visibleIndex]);

  const advance = useCallback(() => {
    if (pausedRef.current) return;
    transitionTo((visibleIndex + 1) % STEPS.length);
  }, [transitionTo, visibleIndex]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  const goTo = useCallback((index: number) => {
    transitionTo(index);
  }, [transitionTo]);

  const goPrev = useCallback(() => {
    transitionTo((visibleIndex - 1 + STEPS.length) % STEPS.length);
  }, [transitionTo, visibleIndex]);

  const goNext = useCallback(() => {
    transitionTo((visibleIndex + 1) % STEPS.length);
  }, [transitionTo, visibleIndex]);

  const handleVideoEnded = useCallback(() => {
    // Always auto-advance on video end, even if user has interacted (paused)
    transitionTo((visibleIndex + 1) % STEPS.length);
  }, [transitionTo, visibleIndex]);

  const handleVideoCanPlay = useCallback(() => {
    setVideoLoaded(true);
  }, []);

  // Start fallback timer for icon-only slides (video slides use key + autoPlay)
  useEffect(() => {
    if (!open) return;
    const step = STEPS[activeIndex];
    if (!step.video) {
      fallbackTimerRef.current = setTimeout(advance, ICON_SLIDE_MS);
    }

    return () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };
  }, [open, activeIndex, advance]);

  const step = STEPS[activeIndex];
  const videoSrc = step.video ? (isDark ? step.video.dark : step.video.light) : null;

  // Preload only next and previous video (metadata only) for faster step switching
  useEffect(() => {
    if (!open || !mounted) return;
    const prevIndex = (activeIndex - 1 + STEPS.length) % STEPS.length;
    const nextIndex = (activeIndex + 1) % STEPS.length;
    const toPreload: string[] = [];
    const prevStep = STEPS[prevIndex];
    const nextStep = STEPS[nextIndex];
    if (prevStep?.video) {
      toPreload.push(isDark ? prevStep.video.dark : prevStep.video.light);
    }
    if (nextStep?.video && nextIndex !== prevIndex) {
      const src = isDark ? nextStep.video.dark : nextStep.video.light;
      if (!toPreload.includes(src)) toPreload.push(src);
    }
    if (toPreload.length === 0) return;
    const preloaded: HTMLVideoElement[] = [];
    for (const src of toPreload) {
      const el = document.createElement("video");
      el.preload = "metadata";
      el.src = src;
      el.load();
      preloaded.push(el);
    }
    return () => {
      for (const v of preloaded) {
        v.src = "";
        v.load();
      }
    };
  }, [open, mounted, activeIndex, isDark]);

  return { activeIndex, step, videoSrc, fading, videoLoaded, goTo, goPrev, goNext, handleVideoEnded, handleVideoCanPlay, pause };
}

export function WorkspaceInstructionModal({
  open,
  canClose,
  showFallback,
  onRequestClose,
  onFallbackContinue,
  onUserInteracted,
  isGenerating,
  progressText,
  completedSteps = [],
  totalSteps = 6,
  generationComplete,
  workspaceSlug,
  onOpenWorkspace,
}: WorkspaceInstructionModalProps) {
  const carousel = useCarousel(open);
  const { activeIndex, step, videoSrc, fading, videoLoaded, goTo, goPrev, goNext, handleVideoEnded, handleVideoCanPlay, pause } = carousel;
  const { resolvedTheme } = useTheme();

  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setIsVisible(true);
      setIsClosing(false);
    } else if (isVisible) {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setIsClosing(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // Do not allow close while generating
        if (isGenerating) return;
        if (canClose) {
          onRequestClose?.();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, canClose, isGenerating, showFallback, onRequestClose, onFallbackContinue]);

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[90] flex items-center justify-center px-4 py-6 transition-opacity duration-300 ease-out",
        // Lighter overlay when generating or generation complete so floating cards stay clear
        isGenerating || (!!generationComplete && !!workspaceSlug)
          ? "bg-black/5 dark:bg-black/15 backdrop-blur-[16px]"
          : "bg-black/25 dark:bg-black/40 backdrop-blur-[24px]",
        isClosing ? "opacity-0" : "opacity-100"
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Workspace instruction"
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        onClick={() => { pause(); onUserInteracted?.(); }}
        className={cn(
          "relative w-full max-w-[1100px] rounded-[28px] shadow-[0_28px_80px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.4)] dark:shadow-[0_28px_80px_rgba(0,0,0,0.5),0_8px_24px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-300 ease-out",
          isGenerating || (!!generationComplete && !!workspaceSlug)
            ? "bg-white/85 dark:bg-gray-900/75 backdrop-blur-md"
            : "bg-white/80 dark:bg-gray-900/65 backdrop-blur-[24px] backdrop-saturate-[180%]",
          isClosing ? "opacity-0 scale-[0.97]" : "opacity-100 scale-100"
        )}
      >

        <div className="relative z-[2] flex h-[690px] flex-col rounded-[24px] bg-transparent overflow-hidden">

          {/* Generating banner at top — when isGenerating, shows progress and step indicator */}
          {isGenerating && (
            <div className="shrink-0 flex flex-col gap-2 px-5 py-4 bg-sidebar border-b border-sidebar-border">
              <div className="flex items-center gap-3">
                <DotLottieReact
                  src={resolvedTheme === "light" ? "/thinkexlight.lottie" : "/logo.lottie"}
                  loop
                  autoplay
                  mode="bounce"
                  className="h-7 w-7 shrink-0"
                />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <h3 className="text-sm font-semibold text-sidebar-foreground">
                    Your workspace is generating
                  </h3>
                  <p className="text-xs text-sidebar-foreground/80 truncate">
                    {progressText || "Preparing..."}
                  </p>
                </div>
              </div>
              {/* Progress bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-white/20 dark:bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
                    style={{
                      width: `${totalSteps > 0 ? (completedSteps.length / totalSteps) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="text-xs font-medium text-sidebar-foreground/80 tabular-nums">
                  {completedSteps.length}/{totalSteps}
                </span>
              </div>
            </div>
          )}

          {/* Generation complete banner — when user interacted, show button instead of auto-redirect */}
          {generationComplete && workspaceSlug && onOpenWorkspace && (
            <div className="shrink-0 flex flex-col items-center justify-center gap-3 px-5 py-4 bg-sidebar border-b border-sidebar-border">
              <h3 className="text-sm font-semibold text-sidebar-foreground">
                Your workspace is ready
              </h3>
              <button
                type="button"
                onClick={onOpenWorkspace}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_2px_8px_rgba(59,130,246,0.4)] transition-all duration-200 cursor-pointer"
              >
                Open workspace
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Upper panel — video/carousel (always shown, including when generating) */}
              <div className="relative min-h-0 flex-1 overflow-hidden bg-sidebar">
                <div className="absolute -left-20 -top-20 h-44 w-44 rounded-full bg-primary/15 blur-[80px]" />
                <div className="absolute -bottom-20 -right-20 h-52 w-52 rounded-full bg-accent/25 blur-[80px]" />

                {/* Left chevron */}
                <button
                  type="button"
                  onClick={() => { goPrev(); onUserInteracted?.(); }}
                  className="absolute left-0 top-0 z-10 h-full w-16 flex items-center justify-center text-sidebar-foreground mix-blend-difference transition-all duration-200 cursor-pointer"
                  aria-label="Previous step"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>

                {/* Right chevron */}
                <button
                  type="button"
                  onClick={() => { goNext(); onUserInteracted?.(); }}
                  className="absolute right-0 top-0 z-10 h-full w-16 flex items-center justify-center text-sidebar-foreground mix-blend-difference transition-all duration-200 cursor-pointer"
                  aria-label="Next step"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>

                {/* Video or icon fallback */}
                <div
                  className={cn(
                    "relative h-full w-full transition-opacity",
                    fading ? "opacity-0" : "opacity-100"
                  )}
                  style={{ transitionDuration: `${FADE_MS}ms` }}
                >
                  {/* Video — fades in once ready */}
                  {videoSrc && (
                    <video
                      key={videoSrc}
                      src={videoSrc}
                      autoPlay
                      muted
                      playsInline
                      preload="auto"
                      onEnded={handleVideoEnded}
                      onPlay={(e) => {
                        e.currentTarget.playbackRate = 0.7;
                        handleVideoCanPlay();
                      }}
                      className={cn(
                        "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
                        videoLoaded ? "opacity-100" : "opacity-0"
                      )}
                    />
                  )}
                </div>
              </div>

              {/* Lower panel — text, dots, action buttons (always shown, including when generating) */}
              <div className="relative flex flex-col items-center gap-1 bg-sidebar px-5 pb-4 pt-3 rounded-b-[24px]">
                {/* Text block — fades with the video */}
                <div
                  className={cn(
                    "flex flex-col items-center gap-1 transition-opacity",
                    fading ? "opacity-0" : "opacity-100"
                  )}
                  style={{ transitionDuration: `${FADE_MS}ms` }}
                >
                  {/* Label */}
                  <h3 className="text-2xl font-semibold text-sidebar-foreground text-center">
                    {step.label}
                  </h3>
                </div>

                {/* Dot navigation */}
                <div className="flex items-center justify-center gap-2 pt-2">
                  {STEPS.map((s, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => { goTo(index); onUserInteracted?.(); }}
                      className={cn(
                        "h-2 rounded-full transition-all duration-300",
                        index === activeIndex
                          ? "w-6 bg-primary shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                          : "w-2 bg-sidebar-foreground/25 hover:bg-sidebar-foreground/40"
                      )}
                      aria-label={`Go to slide ${index + 1}: ${s.label}`}
                    />
                  ))}
                </div>

                {/* CTA — vertically centered in bottom bar */}
                {canClose && (
                  <button
                    type="button"
                    onClick={onRequestClose}
                    className="absolute right-5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium bg-white/25 dark:bg-white/10 backdrop-blur-md border border-white/20 dark:border-white/[0.08] text-sidebar-foreground hover:bg-white/35 dark:hover:bg-white/15 shadow-[0_2px_8px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.3)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-200"
                  >
                    <X className="h-3.5 w-3.5" />
                    Close
                  </button>
                )}

              </div>
        </div>
      </div>
    </div>
  );
}
