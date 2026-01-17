"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Users, Github, ArrowRight } from "lucide-react";
import { BackgroundCard, cardColors, type BackgroundCardData } from "./BackgroundCard";

// Random card positions and sizes (static - no parallax)
const backgroundCards: BackgroundCardData[] = [
  { top: "10%", left: "5%", width: "180px", height: "140px", color: cardColors[0], rotation: -3 },
  { top: "25%", left: "75%", width: "200px", height: "160px", color: cardColors[1], rotation: 2 },
  { top: "50%", left: "5%", width: "160px", height: "120px", color: cardColors[2], rotation: -2 },
  { top: "65%", left: "80%", width: "190px", height: "150px", color: cardColors[3], rotation: 3 },
  { top: "8%", left: "85%", width: "150px", height: "110px", color: cardColors[5], rotation: -1 },
  { top: "75%", left: "25%", width: "180px", height: "140px", color: cardColors[6], rotation: 2 },
  { top: "30%", left: "20%", width: "160px", height: "120px", color: cardColors[7], rotation: -2 },
];

export function Hero() {
  return (
    <section
      id="hero"
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-4 md:py-12 sm:px-6 lg:px-8"
    >
      {/* Workspace Background Elements */}
      <div className="absolute inset-0 z-0 opacity-40">
        {/* Static Background Cards */}
        {backgroundCards.map((card, index) => {
          const isDesktopOnly = index >= 3;
          return (
            <BackgroundCard
              key={index}
              card={card}
              isDesktopOnly={isDesktopOnly}
            />
          );
        })}

        {/* Gradient fade-out at bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 h-64 pointer-events-none"
          style={{
            background: `linear-gradient(to bottom, transparent 0%, var(--background) 100%)`,
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-6xl">
        <div className="space-y-8 md:space-y-12 text-center">
          {/* Backed by Section */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-base md:text-lg text-muted-foreground mb-0 md:mb-1 font-light">
            <a
              href="https://www.hatchery.umd.edu/about-mokhtarzadas"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:text-foreground transition-colors cursor-pointer"
            >
              <Image
                src="/hatchery.png"
                alt="Mokhtarzada Hatchery"
                width={140}
                height={28}
                className="h-6 md:h-7 w-auto"
                priority
              />
              <span>Mokhtarzada Hatchery 2025 Cohort</span>
            </a>
            <div className="hidden sm:block w-1 h-1 rounded-full bg-muted-foreground/50" />
            <div className="flex items-center gap-2">
              <Users className="h-7 w-7 text-blue-500" />
              <span>100+ Weekly Active Users</span>
            </div>
            <div className="hidden sm:block w-1 h-1 rounded-full bg-muted-foreground/50" />
            <a
              href="https://github.com/thinkex-oss/thinkex"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:text-foreground transition-colors cursor-pointer"
            >
              <Github className="h-7 w-7 text-violet-500" />
              <span>Open Source</span>
            </a>
          </div>

          {/* Header - Above Video */}
          <div className="space-y-6">
            <h1 className="mt-4 md:mt-12 text-5xl font-normal tracking-tight text-foreground sm:text-6xl md:text-7xl lg:text-8xl">
              The{" "}
              <span className="relative inline-block">
                <span className="relative px-3 py-0.5 rounded-sm inline-block">
                  <span
                    className="absolute inset-0 rounded-sm"
                    style={{
                      background: "rgba(252, 211, 77, 0.15)",
                      border: "1px solid rgba(252, 211, 77, 0.4)",
                      left: "2px",
                    }}
                  />
                  <span className="relative z-10">Human Interface</span>
                </span>
              </span>{" "}
              for AI
            </h1>

            <div className="w-full max-w-2xl mx-auto h-[1.5px] bg-gradient-to-r from-transparent via-muted-foreground/20 to-transparent" />

            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
              ThinkEx is the visual thinking environment where you can compound your notes, media, and AI chats into lasting knowledge.
            </p>
          </div>

          {/* Get Started Button - Above Video */}
          <div className="flex justify-center mb-12 md:mb-24">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-md bg-foreground px-8 text-base font-medium text-background transition-all hover:bg-foreground/90"
            >
              <Link href="/guest-setup" prefetch className="flex items-center gap-2">
                Try for Free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          {/* Mobile Demo Image - Only visible on mobile */}
          <div className="relative w-full md:hidden">
            <div className="relative w-full max-w-md mx-auto px-4">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border border-foreground/20 shadow-2xl">
                <Image
                  src="/demo.png"
                  alt="ThinkEx Demo"
                  fill
                  priority
                  sizes="100vw"
                  className="object-cover"
                />
              </div>
            </div>
          </div>

          {/* Desktop Demo Image - Hidden on mobile */}
          <div className="relative w-full hidden md:block">
            <div className="relative w-full md:w-[calc(100%+3rem)] md:-ml-6">
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md border border-foreground/20 shadow-2xl">
                <Image
                  src="/demo.png"
                  alt="ThinkEx Demo"
                  fill
                  priority
                  sizes="80vw"
                  className="object-fill"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
