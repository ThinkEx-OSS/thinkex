"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { useTheme } from "next-themes";
import { ThinkExLogo } from "@/components/ui/thinkex-logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";

const VIDEO_BASE =
  "https://uxcoymwbfcbvkgwbhttq.supabase.co/storage/v1/object/public/video";

const FEATURES = [
  {
    title: "Upload a PDF, AI makes summaries & study guides",
    description:
      "Drop in any document and get instant AI-generated summaries, flashcards, and study materials.",
    dark: `${VIDEO_BASE}/step-2-generate-card-dark-3.mp4`,
    light: `${VIDEO_BASE}/step-2-generate-card-light-3.mp4`,
  },
  {
    title: "Select cards & chat with AI for answers from your materials",
    description:
      "Highlight what matters. Ask questions and get grounded answers from your own sources.",
    dark: `${VIDEO_BASE}/step-3-pdf-ss-dark.mp4`,
    light: `${VIDEO_BASE}/step-3-pdf-ss-light.mp4`,
  },
  {
    title: "Drag, resize & organize cards on your grid",
    description:
      "Arrange your workspace exactly how you think. Move, resize, and group cards freely.",
    dark: `${VIDEO_BASE}/step-1-arrange-dark.mp4`,
    light: `${VIDEO_BASE}/step-1-arrange-light.mp4`,
  },
  {
    title: "Share your workspace to collaborate in real time",
    description:
      "Invite teammates to your workspace. See changes live, work together seamlessly.",
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
      key={src}
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
  if (!mounted) {
    return (
      <div className="w-full aspect-video rounded-2xl bg-muted animate-pulse" />
    );
  }
  return (
    <AutoplayVideo
      src={isDark ? darkSrc : lightSrc}
      className="w-full rounded-2xl"
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
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border/40">
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
      <section className="flex flex-col items-center px-6 pt-16 pb-16 md:pt-24 md:pb-20">
        <div className="w-full max-w-5xl mx-auto flex flex-col items-center text-center gap-5 md:gap-6">
          <div className="flex flex-col items-center gap-10 md:gap-12">
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
            <div key={f.title} className="flex flex-col gap-6">
              <div className="max-w-xl">
                <h2 className="text-2xl md:text-3xl font-semibold tracking-tight leading-snug">
                  {f.title}
                </h2>
                <p className="mt-2 text-muted-foreground text-base md:text-lg leading-relaxed">
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
      <section className="flex flex-col items-center text-center px-6 pt-8 pb-16 md:pb-24">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight">
          Ready to get started?
        </h2>
        <div className="mt-6">
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
      <footer className="border-t border-border/40 py-6">
        <p className="text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} ThinkEx
        </p>
      </footer>
    </div>
  );
}
