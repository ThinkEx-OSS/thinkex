"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import { GraduationCap, FileText, FileImage, FileAudio } from "lucide-react";
import NextImage from "next/image";
import { useTheme } from "next-themes";
import { ThinkExLogo } from "@/components/ui/thinkex-logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { cn } from "@/lib/utils";

const VIDEO_BASE =
  "https://uxcoymwbfcbvkgwbhttq.supabase.co/storage/v1/object/public/video";

const FEATURES = [
  {
    title: "Instant AI Study Guides",
    description: "Drop a PDF, get summaries, flashcards, and study materials.",
    dark: `${VIDEO_BASE}/step-2-generate-card-dark-3.mp4`,
    light: `${VIDEO_BASE}/step-2-generate-card-light-3.mp4`,
  },
  {
    title: "Chat With Your Sources",
    description: "Ask questions, get answers grounded in your own materials.",
    dark: `${VIDEO_BASE}/step-3-pdf-ss-dark.mp4`,
    light: `${VIDEO_BASE}/step-3-pdf-ss-light.mp4`,
  },
  {
    title: "A Canvas That Adapts to You",
    description: "Drag, resize, and organize cards however you think.",
    dark: `${VIDEO_BASE}/step-1-arrange-dark.mp4`,
    light: `${VIDEO_BASE}/step-1-arrange-light.mp4`,
  },
  {
    title: "Real-Time Collaboration",
    description: "Invite teammates. See changes live, work together seamlessly.",
    dark: `${VIDEO_BASE}/step-5-collab-dark.mp4`,
    light: `${VIDEO_BASE}/step-5-collab-light.mp4`,
  },
] as const;

function AutoplayVideo({
  src,
  poster,
  className,
  preload = "none",
}: {
  src: string;
  poster?: string;
  className?: string;
  preload?: "none" | "metadata";
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload={preload}
      className={className}
    />
  );
}

function FeatureVideo({
  darkSrc,
  lightSrc,
  mounted,
  isDark,
}: {
  darkSrc: string;
  lightSrc: string;
  mounted: boolean;
  isDark: boolean;
}) {
  const src = isDark ? darkSrc : lightSrc;
  if (!mounted) {
    return (
      <div className="w-full aspect-video rounded-2xl bg-muted animate-pulse" />
    );
  }
  return (
    <AutoplayVideo
      key={src}
      src={src}
      className="w-full aspect-video rounded-2xl"
    />
  );
}

export function LandingPage() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 px-4 transition-[padding] duration-500">
        <div
          className={cn(
            "mx-auto flex items-center justify-between px-6 transition-all duration-500 ease-out",
            scrolled
              ? "max-w-3xl mt-2 h-14 rounded-full bg-background/70 backdrop-blur-xl border border-border/50 shadow-lg"
              : "max-w-6xl h-[4.5rem] bg-transparent"
          )}
        >
          <Link href="/" className="flex items-center gap-3">
            <ThinkExLogo size={38} priority />
            <span className="text-2xl md:text-3xl font-medium tracking-tight">
              ThinkEx
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle size="md" />
            <Button size="lg" className="px-6 text-base" asChild>
              <Link href="/auth/sign-in">Sign In</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center px-6 pt-10 pb-16 md:pt-16 md:pb-20">
        <div className="w-full max-w-5xl mx-auto flex flex-col items-center text-center gap-5 md:gap-6">
          <div className="flex flex-col items-center gap-6 md:gap-8">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-normal tracking-normal text-muted-foreground md:gap-2.5 md:px-5 md:py-2.5 md:text-[0.9375rem]">
              <GraduationCap
                className="size-4 shrink-0 text-muted-foreground/90 md:size-[1.125rem]"
                strokeWidth={1.5}
                aria-hidden
              />
              <span>100% free for Finals season</span>
            </p>
            <h1 className="text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-medium tracking-tight leading-[1.08]">
              <span className="block">
                Your{" "}
                <span className="relative inline-block group/files">
                  <span className="relative z-10 decoration-2 underline decoration-dotted decoration-foreground/15 underline-offset-[6px] group-hover/files:decoration-foreground/40 transition-colors duration-200">Files</span>
                  <span className="pointer-events-none absolute -top-7 md:-top-9 lg:-top-11 left-1/2 -translate-x-1/2 flex items-end gap-1.5 md:gap-2 opacity-0 scale-75 translate-y-2 group-hover/files:opacity-100 group-hover/files:scale-100 group-hover/files:translate-y-0 transition-all duration-300 ease-out">
                    <FileText className="size-6 md:size-8 lg:size-10 text-blue-500 drop-shadow-sm -rotate-12 transition-all duration-300 delay-0 group-hover/files:-rotate-6" />
                    <FileImage className="size-6 md:size-8 lg:size-10 text-emerald-500 drop-shadow-sm transition-all duration-300 delay-75" />
                    <FileAudio className="size-6 md:size-8 lg:size-10 text-amber-500 drop-shadow-sm rotate-12 transition-all duration-300 delay-150 group-hover/files:rotate-6" />
                  </span>
                </span>
                {" "}and{" "}
                <span className="relative inline-block group/ai">
                  <span className="relative z-10 decoration-2 underline decoration-dotted decoration-foreground/15 underline-offset-[6px] group-hover/ai:decoration-foreground/40 transition-colors duration-200">AI</span>
                  <span className="pointer-events-none absolute -top-7 md:-top-9 lg:-top-11 left-1/2 -translate-x-1/2 flex items-end gap-1.5 md:gap-2 opacity-0 scale-75 translate-y-2 group-hover/ai:opacity-100 group-hover/ai:scale-100 group-hover/ai:translate-y-0 transition-all duration-300 ease-out">
                    <NextImage src="/model-logos/gemini.svg" alt="Gemini" width={40} height={40} className="size-6 md:size-8 lg:size-10 drop-shadow-sm -rotate-12 transition-all duration-300 delay-0 group-hover/ai:-rotate-6" />
                    <NextImage src="/model-logos/claude.svg" alt="Claude" width={40} height={40} className="size-6 md:size-8 lg:size-10 drop-shadow-sm transition-all duration-300 delay-75" />
                    <NextImage src="/model-logos/chatgpt.svg" alt="ChatGPT" width={40} height={40} className="size-6 md:size-8 lg:size-10 drop-shadow-sm rotate-12 transition-all duration-300 delay-150 group-hover/ai:rotate-6 dark:invert" />
                  </span>
                </span>
              </span>
              <span className="block">in One Place</span>
            </h1>
          </div>
          <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed">
            Study and research without switching between endless windows
          </p>
        </div>
        <div className="mt-8 flex justify-center">
          <Button
            size="lg"
            className="h-auto min-h-12 px-8 py-4 text-lg"
            asChild
          >
            <Link href="/home">Get Started</Link>
          </Button>
        </div>
      </section>

      {/* Main demo video */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto rounded-2xl border border-border/60 shadow-lg overflow-hidden bg-card">
          <AutoplayVideo
            src="/finaldemo.mp4"
            poster="/finaldemo-poster.png"
            preload="metadata"
            className="w-full"
          />
        </div>
      </section>

      {/* Features */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto flex flex-col gap-24">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg md:text-xl font-semibold tracking-tight">
                  {f.title}
                </h2>
                <p className="mt-1 text-muted-foreground text-sm md:text-base">
                  {f.description}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 shadow-lg overflow-hidden bg-card">
                <FeatureVideo
                  darkSrc={f.dark}
                  lightSrc={f.light}
                  mounted={mounted}
                  isDark={isDark}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="flex flex-col items-center text-center px-6 pt-16 pb-16 md:pt-24 md:pb-20">
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight leading-[1.08]">
          Ready to get started?
        </h2>
        <p className="mt-4 text-lg md:text-xl text-muted-foreground">
          Study and research without switching between endless windows
        </p>
        <div className="mt-8">
          <Button
            size="lg"
            className="h-auto min-h-12 px-8 py-4 text-lg"
            asChild
          >
            <Link href="/home">Get Started</Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}
