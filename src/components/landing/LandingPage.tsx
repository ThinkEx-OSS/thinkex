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
  useEffect(() => setMounted(true), []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-[4.5rem]">
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
      <section className="relative flex flex-col items-center px-6 pt-10 pb-16 md:pt-16 md:pb-20 overflow-hidden">
        {/* Floating file icons — left side */}
        <div className="hidden lg:block absolute inset-0 pointer-events-none" aria-hidden>
          <FileText className="pointer-events-auto absolute left-[8%] top-[18%] size-10 xl:size-12 text-blue-500/50 -rotate-12 animate-[landing-float_4s_ease-in-out_infinite] cursor-pointer transition-all duration-300 hover:text-blue-500 hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(59,130,246,0.5)]" />
          <FileImage className="pointer-events-auto absolute left-[12%] top-[50%] size-9 xl:size-11 text-emerald-500/50 rotate-6 animate-[landing-float_5s_ease-in-out_infinite_0.5s] cursor-pointer transition-all duration-300 hover:text-emerald-500 hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(16,185,129,0.5)]" />
          <FileAudio className="pointer-events-auto absolute left-[6%] top-[76%] size-10 xl:size-12 text-amber-500/50 -rotate-6 animate-[landing-float_4.5s_ease-in-out_infinite_1s] cursor-pointer transition-all duration-300 hover:text-amber-500 hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(245,158,11,0.5)]" />
        </div>
        {/* Floating AI logos — right side */}
        <div className="hidden lg:block absolute inset-0 pointer-events-none" aria-hidden>
          <NextImage src="/model-logos/gemini.svg" alt="" width={48} height={48} className="pointer-events-auto absolute right-[10%] top-[15%] size-10 xl:size-12 opacity-50 rotate-12 animate-[landing-float_4.5s_ease-in-out_infinite_0.3s] cursor-pointer transition-all duration-300 hover:opacity-100 hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(66,133,244,0.5)]" />
          <NextImage src="/model-logos/claude.svg" alt="" width={48} height={48} className="pointer-events-auto absolute right-[14%] top-[48%] size-9 xl:size-11 opacity-50 -rotate-6 animate-[landing-float_5s_ease-in-out_infinite_0.8s] cursor-pointer transition-all duration-300 hover:opacity-100 hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(217,119,87,0.5)]" />
          <NextImage src="/model-logos/chatgpt.svg" alt="" width={48} height={48} className="pointer-events-auto absolute right-[8%] top-[78%] size-10 xl:size-12 opacity-50 rotate-6 dark:invert animate-[landing-float_4s_ease-in-out_infinite_1.2s] cursor-pointer transition-all duration-300 hover:opacity-100 hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(0,0,0,0.3)]" />
        </div>
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
              <span className="block">Your Files and AI</span>
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
                <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
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
